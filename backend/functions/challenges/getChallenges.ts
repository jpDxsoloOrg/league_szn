import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
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

const buildPlayerInfo = (item: Record<string, unknown> | undefined): PlayerInfo => ({
  playerId: item ? (item.playerId as string) : '',
  playerName: item ? (item.name as string) : 'Unknown',
  wrestlerName: item ? (item.currentWrestler as string) : 'Unknown',
  imageUrl: item ? (item.imageUrl as string | undefined) : undefined,
});

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { status, playerId } = event.queryStringParameters || {};

    let challenges: Record<string, unknown>[];

    if (playerId) {
      // Query both indexes and merge results for singles challenges
      const [sentResult, receivedResult] = await Promise.all([
        dynamoDb.queryAll({
          TableName: TableNames.CHALLENGES,
          IndexName: 'ChallengerIndex',
          KeyConditionExpression: 'challengerId = :pid',
          ExpressionAttributeValues: { ':pid': playerId },
          ScanIndexForward: false,
        }),
        dynamoDb.queryAll({
          TableName: TableNames.CHALLENGES,
          IndexName: 'ChallengedIndex',
          KeyConditionExpression: 'challengedId = :pid',
          ExpressionAttributeValues: { ':pid': playerId },
          ScanIndexForward: false,
        }),
      ]);

      // Deduplicate by challengeId
      const seen = new Set<string>();
      challenges = [];
      for (const c of [...sentResult, ...receivedResult]) {
        if (!seen.has(c.challengeId as string)) {
          seen.add(c.challengeId as string);
          challenges.push(c);
        }
      }

      // Also find tag team challenges where the player's tag team is involved
      const [player1TeamResult, player2TeamResult] = await Promise.all([
        dynamoDb.queryAll({
          TableName: TableNames.TAG_TEAMS,
          IndexName: 'Player1Index',
          KeyConditionExpression: 'player1Id = :pid',
          ExpressionAttributeValues: { ':pid': playerId },
        }),
        dynamoDb.queryAll({
          TableName: TableNames.TAG_TEAMS,
          IndexName: 'Player2Index',
          KeyConditionExpression: 'player2Id = :pid',
          ExpressionAttributeValues: { ':pid': playerId },
        }),
      ]);

      const allTeams = [...player1TeamResult, ...player2TeamResult];
      const activeTagTeam = allTeams.find((tt) => tt.status === 'active');

      if (activeTagTeam) {
        const tagTeamId = activeTagTeam.tagTeamId as string;
        const tagTeamChallenges = await dynamoDb.scanAll({
          TableName: TableNames.CHALLENGES,
          FilterExpression: '(challengerTagTeamId = :ttId OR challengedTagTeamId = :ttId)',
          ExpressionAttributeValues: { ':ttId': tagTeamId },
        });

        // Merge tag team challenges, deduplicating
        for (const c of tagTeamChallenges) {
          if (!seen.has(c.challengeId as string)) {
            seen.add(c.challengeId as string);
            challenges.push(c);
          }
        }
      }
    } else if (status) {
      challenges = await dynamoDb.queryAll({
        TableName: TableNames.CHALLENGES,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#s = :status',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':status': status },
        ScanIndexForward: false,
      });
    } else {
      challenges = await dynamoDb.scanAll({
        TableName: TableNames.CHALLENGES,
      });
    }

    // Enrich with player names
    const playerIds = new Set<string>();
    for (const c of challenges) {
      playerIds.add(c.challengerId as string);
      playerIds.add(c.challengedId as string);
    }

    const playerMap: Record<string, { name: string; currentWrestler: string; imageUrl?: string }> = {};
    for (const pid of playerIds) {
      const result = await dynamoDb.get({
        TableName: TableNames.PLAYERS,
        Key: { playerId: pid },
      });
      if (result.Item) {
        playerMap[pid] = {
          name: result.Item.name as string,
          currentWrestler: result.Item.currentWrestler as string,
          imageUrl: result.Item.imageUrl as string | undefined,
        };
      }
    }

    // Collect tag team IDs that need enrichment
    const tagTeamIds = new Set<string>();
    for (const c of challenges) {
      if (c.challengerTagTeamId) {
        tagTeamIds.add(c.challengerTagTeamId as string);
      }
      if (c.challengedTagTeamId) {
        tagTeamIds.add(c.challengedTagTeamId as string);
      }
    }

    // Batch-fetch tag teams
    const tagTeamMap: Record<string, Record<string, unknown>> = {};
    if (tagTeamIds.size > 0) {
      const tagTeamFetches = Array.from(tagTeamIds).map(async (ttId) => {
        const result = await dynamoDb.get({
          TableName: TableNames.TAG_TEAMS,
          Key: { tagTeamId: ttId },
        });
        if (result.Item) {
          tagTeamMap[ttId] = result.Item;
        }
      });
      await Promise.all(tagTeamFetches);

      // Fetch all tag team member players not already in playerMap
      const memberPlayerIds = new Set<string>();
      for (const tt of Object.values(tagTeamMap)) {
        const p1Id = tt.player1Id as string;
        const p2Id = tt.player2Id as string;
        if (p1Id && !playerMap[p1Id]) memberPlayerIds.add(p1Id);
        if (p2Id && !playerMap[p2Id]) memberPlayerIds.add(p2Id);
      }

      if (memberPlayerIds.size > 0) {
        const memberFetches = Array.from(memberPlayerIds).map(async (pid) => {
          const result = await dynamoDb.get({
            TableName: TableNames.PLAYERS,
            Key: { playerId: pid },
          });
          if (result.Item) {
            playerMap[pid] = {
              name: result.Item.name as string,
              currentWrestler: result.Item.currentWrestler as string,
              imageUrl: result.Item.imageUrl as string | undefined,
            };
          }
        });
        await Promise.all(memberFetches);
      }
    }

    // Build tag team info helper
    const buildTagTeamInfo = (ttId: string): TagTeamChallengeInfo | undefined => {
      const tt = tagTeamMap[ttId];
      if (!tt) return undefined;

      const p1Id = tt.player1Id as string;
      const p2Id = tt.player2Id as string;
      const p1 = playerMap[p1Id];
      const p2 = playerMap[p2Id];

      return {
        tagTeamId: ttId,
        tagTeamName: tt.name as string,
        player1: p1
          ? { playerId: p1Id, playerName: p1.name, wrestlerName: p1.currentWrestler, imageUrl: p1.imageUrl }
          : buildPlayerInfo(undefined),
        player2: p2
          ? { playerId: p2Id, playerName: p2.name, wrestlerName: p2.currentWrestler, imageUrl: p2.imageUrl }
          : buildPlayerInfo(undefined),
      };
    };

    const enriched = challenges.map((c) => {
      const challenger = playerMap[c.challengerId as string];
      const challenged = playerMap[c.challengedId as string];

      const base: Record<string, unknown> = {
        ...c,
        challengeMode: (c.challengeMode as string) || 'singles',
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
          base.challengerTagTeamId = c.challengerTagTeamId as string;
          const info = buildTagTeamInfo(c.challengerTagTeamId as string);
          if (info) {
            base.challengerTagTeam = info;
          }
        }
        if (c.challengedTagTeamId) {
          base.challengedTagTeamId = c.challengedTagTeamId as string;
          const info = buildTagTeamInfo(c.challengedTagTeamId as string);
          if (info) {
            base.challengedTagTeam = info;
          }
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
