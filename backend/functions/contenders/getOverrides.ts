import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import type { TagTeam } from '../../lib/repositories/types';
import { createReviewerNameLookup, UNKNOWN_REVIEWER } from '../../lib/reviewerName';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.queryStringParameters?.championshipId;
    const { competition: { contenders }, roster: { players, tagTeams } } = getRepositories();

    const overrides = await contenders.listActiveOverrides(championshipId);
    const hasTagOverrides = overrides.some((override) => override.entityType === 'tagTeam');

    // Every status, so an override on a team dissolved since still has a name
    const teamsById = new Map<string, TagTeam>(
      hasTagOverrides ? (await tagTeams.listAll()).map((team) => [team.tagTeamId, team]) : [],
    );

    // Collect unique player IDs for enrichment: tag overrides need their members
    const playerIds = new Set<string>();
    for (const override of overrides) {
      if (override.entityType === 'tagTeam') {
        const team = teamsById.get(override.playerId);
        if (team) {
          playerIds.add(team.player1Id);
          playerIds.add(team.player2Id);
        }
      } else {
        playerIds.add(override.playerId);
      }
    }

    // Fetch player details
    const playersMap = new Map<string, { name: string; currentWrestler: string; imageUrl?: string }>();
    for (const playerId of playerIds) {
      const player = await players.findById(playerId);
      if (player) {
        playersMap.set(playerId, player);
      }
    }

    // Each override's stored position, so staff can see which ones show on a list
    const rankByOverride = new Map<string, number>();
    const championshipIds = new Set(overrides.map((override) => override.championshipId));
    for (const id of championshipIds) {
      const rankings = await contenders.listByChampionship(id);
      for (const ranking of rankings) {
        rankByOverride.set(`${id}#${ranking.playerId}`, ranking.rank);
      }
    }

    // createdBy holds the staff member's account id, which isn't fit to display
    const staffName = createReviewerNameLookup(overrides.length > 0 ? await players.list() : []);

    // Enrich overrides with player (or team) names and sort by createdAt desc.
    // Tag overrides fill playerName with the members' names and wrestlerName
    // with the team name, as tag contender rows do.
    const enriched = overrides
      .map((override) => {
        const shared = {
          ...override,
          entityType: override.entityType ?? 'player',
          createdBy: staffName(override.createdBy) ?? UNKNOWN_REVIEWER,
          currentRank: rankByOverride.get(`${override.championshipId}#${override.playerId}`) ?? null,
        };
        if (override.entityType === 'tagTeam') {
          const team = teamsById.get(override.playerId);
          const members = team
            ? [team.player1Id, team.player2Id].map((memberId) => ({
              playerId: memberId,
              playerName: playersMap.get(memberId)?.name || 'Unknown',
            }))
            : [];
          return {
            ...shared,
            tagTeamId: override.playerId,
            tagTeamName: team?.name || 'Unknown',
            members,
            playerName: members.length > 0 ? members.map((member) => member.playerName).join(' & ') : 'Unknown',
            wrestlerName: team?.name || 'Unknown',
            playerImageUrl: team?.imageUrl || null,
          };
        }
        const player = playersMap.get(override.playerId);
        return {
          ...shared,
          playerName: player?.name || 'Unknown',
          wrestlerName: player?.currentWrestler || 'Unknown',
          playerImageUrl: player?.imageUrl || null,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return success(enriched);
  } catch (err) {
    console.error('Error fetching contender overrides:', err);
    return serverError('Failed to fetch contender overrides');
  }
};
