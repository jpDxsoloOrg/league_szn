import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { TagTeamStatus } from '../../lib/repositories/types';
import { success, serverError } from '../../lib/response';

interface PlayerRecord {
  playerId: string;
  name: string;
  imageUrl?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const statusFilter = event.queryStringParameters?.status;
    const { tagTeams: tagTeamsRepo, players: playersRepo } = getRepositories();

    const tagTeams = statusFilter
      ? await tagTeamsRepo.listByStatus(statusFilter as TagTeamStatus)
      : await tagTeamsRepo.list();

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
    for (const player of playerResults) {
      if (player) {
        playerMap.set(player.playerId, {
          playerId: player.playerId,
          name: player.name,
          imageUrl: player.imageUrl,
        });
      }
    }

    // Enrich tag teams with player names and image URLs
    const enrichedTagTeams = tagTeams.map((team) => {
      const player1 = playerMap.get(team.player1Id);
      const player2 = playerMap.get(team.player2Id);
      return {
        ...team,
        player1Name: player1?.name || 'Unknown',
        player2Name: player2?.name || 'Unknown',
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
