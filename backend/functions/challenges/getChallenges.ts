import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { Challenge, Player, TagTeam } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

interface PlayerInfo {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  imageUrl?: string;
}

interface TagTeamChallengeInfo {
  tagTeamId: string;
  tagTeamName: string;
  player1: PlayerInfo;
  player2: PlayerInfo;
}

const buildPlayerInfo = (player: Player | undefined): PlayerInfo => ({
  playerId: player ? player.playerId : '',
  playerName: player ? player.name : 'Unknown',
  wrestlerName: player ? player.currentWrestler : 'Unknown',
  imageUrl: player ? player.imageUrl : undefined,
});

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { status, playerId } = event.queryStringParameters || {};
    const { challenges, players, tagTeams } = getRepositories();

    let challengeList: Challenge[];

    if (playerId) {
      challengeList = await challenges.listByPlayer(playerId);
    } else if (status) {
      challengeList = await challenges.listByStatus(status as Challenge['status']);
    } else {
      challengeList = await challenges.list();
    }

    // Enrich with player names
    const playerIds = new Set<string>();
    for (const c of challengeList) {
      playerIds.add(c.challengerId);
      playerIds.add(c.challengedId);
    }

    const playerMap: Record<string, Player> = {};
    await Promise.all(
      Array.from(playerIds).map(async (pid) => {
        const player = await players.findById(pid);
        if (player) {
          playerMap[pid] = player;
        }
      }),
    );

    // Collect tag team IDs that need enrichment
    const tagTeamIds = new Set<string>();
    for (const c of challengeList) {
      if (c.challengerTagTeamId) tagTeamIds.add(c.challengerTagTeamId);
      if (c.challengedTagTeamId) tagTeamIds.add(c.challengedTagTeamId);
    }

    // Batch-fetch tag teams
    const tagTeamMap: Record<string, TagTeam> = {};
    if (tagTeamIds.size > 0) {
      await Promise.all(
        Array.from(tagTeamIds).map(async (ttId) => {
          const tt = await tagTeams.findById(ttId);
          if (tt) tagTeamMap[ttId] = tt;
        }),
      );

      // Fetch all tag team member players not already in playerMap
      const memberPlayerIds = new Set<string>();
      for (const tt of Object.values(tagTeamMap)) {
        if (tt.player1Id && !playerMap[tt.player1Id]) memberPlayerIds.add(tt.player1Id);
        if (tt.player2Id && !playerMap[tt.player2Id]) memberPlayerIds.add(tt.player2Id);
      }

      if (memberPlayerIds.size > 0) {
        await Promise.all(
          Array.from(memberPlayerIds).map(async (pid) => {
            const player = await players.findById(pid);
            if (player) playerMap[pid] = player;
          }),
        );
      }
    }

    // Build tag team info helper
    const buildTagTeamChallengeInfo = (ttId: string): TagTeamChallengeInfo | undefined => {
      const tt = tagTeamMap[ttId];
      if (!tt) return undefined;

      return {
        tagTeamId: ttId,
        tagTeamName: tt.name,
        player1: buildPlayerInfo(playerMap[tt.player1Id]),
        player2: buildPlayerInfo(playerMap[tt.player2Id]),
      };
    };

    const enriched = challengeList.map((c) => {
      const challenger = playerMap[c.challengerId];
      const challenged = playerMap[c.challengedId];

      const base: Record<string, unknown> = {
        ...c,
        challengeMode: c.challengeMode || 'singles',
        challenger: challenger
          ? { playerName: challenger.name, wrestlerName: challenger.currentWrestler, imageUrl: challenger.imageUrl }
          : { playerName: 'Unknown', wrestlerName: 'Unknown' },
        challenged: challenged
          ? { playerName: challenged.name, wrestlerName: challenged.currentWrestler, imageUrl: challenged.imageUrl }
          : { playerName: 'Unknown', wrestlerName: 'Unknown' },
      };

      // Enrich tag team data
      if (c.challengeMode === 'tag_team') {
        if (c.challengerTagTeamId) {
          base.challengerTagTeamId = c.challengerTagTeamId;
          const info = buildTagTeamChallengeInfo(c.challengerTagTeamId);
          if (info) base.challengerTagTeam = info;
        }
        if (c.challengedTagTeamId) {
          base.challengedTagTeamId = c.challengedTagTeamId;
          const info = buildTagTeamChallengeInfo(c.challengedTagTeamId);
          if (info) base.challengedTagTeam = info;
        }
      }

      return base;
    });

    // Sort by createdAt descending
    enriched.sort((a, b) => new Date((b.createdAt as string) || '').getTime() - new Date((a.createdAt as string) || '').getTime());

    return success(enriched);
  } catch (err) {
    console.error('Error fetching challenges:', err);
    return serverError('Failed to fetch challenges');
  }
};
