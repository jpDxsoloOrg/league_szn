import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { TagTeamStatus } from '../../lib/repositories/types';
import { success, serverError } from '../../lib/response';
import { isPlayerVisible } from '../../lib/needsWrestler';
import { hasHiddenMember, resolveTagTeamViewer } from './tagTeamVisibility';
import {
  TagTeamRecord,
  buildTagTeamMatchMap,
  computeTagTeamRecord,
  fetchCompletedMatches,
  resolveMemberName,
} from './computeTagTeamStats';

interface PlayerRecord {
  playerId: string;
  name: string;
  imageUrl?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const statusFilter = event.queryStringParameters?.status;
    const { roster: { tagTeams: tagTeamsRepo, players: playersRepo } } = getRepositories();

    const [tagTeams, completedMatches] = await Promise.all([
      statusFilter
        ? tagTeamsRepo.listByStatus(statusFilter as TagTeamStatus)
        : tagTeamsRepo.list(),
      fetchCompletedMatches(),
    ]);

    // Collect all unique player IDs
    const playerIds = new Set<string>();
    for (const team of tagTeams) {
      playerIds.add(team.player1Id);
      playerIds.add(team.player2Id);
    }

    // Fetch player details in parallel
    const playerResults = await Promise.all(
      Array.from(playerIds).map((playerId) => playersRepo.findById(playerId))
    );

    // Build player lookup map
    const playerMap = new Map<string, PlayerRecord>();
    const hiddenIds = new Set<string>();
    for (const player of playerResults) {
      if (player) {
        if (!isPlayerVisible(player)) hiddenIds.add(player.playerId);
        playerMap.set(player.playerId, {
          playerId: player.playerId,
          name: player.name,
          imageUrl: player.imageUrl,
        });
      }
    }

    const viewer = hiddenIds.size > 0
      ? await resolveTagTeamViewer(event, (userId) => playersRepo.findByUserId(userId))
      : { canSeeAll: true };
    const listedTagTeams = viewer.canSeeAll
      ? tagTeams
      : tagTeams.filter((team) =>
          !hasHiddenMember(team, hiddenIds)
          || team.player1Id === viewer.callerPlayerId
          || team.player2Id === viewer.callerPlayerId);

    const matchMap = buildTagTeamMatchMap(listedTagTeams as unknown as TagTeamRecord[], completedMatches);

    // Enrich tag teams with player names, image URLs and the computed record
    const enrichedTagTeams = listedTagTeams.map((team) => {
      const player1 = playerMap.get(team.player1Id);
      const player2 = playerMap.get(team.player2Id);
      return {
        ...team,
        ...computeTagTeamRecord(matchMap.get(team.tagTeamId) || []),
        player1Name: resolveMemberName(player1, team.player1WrestlerName),
        player2Name: resolveMemberName(player2, team.player2WrestlerName),
        player1ImageUrl: player1?.imageUrl,
        player2ImageUrl: player2?.imageUrl,
      };
    });

    return success(enrichedTagTeams);
  } catch (err) {
    console.error('Error fetching tag teams:', err);
    return serverError('Failed to fetch tag teams');
  }
};
