import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) {
      return badRequest('Player ID is required');
    }

    const { roster: { players }, season: { seasons, seasonStandings } } = getRepositories();

    // Get the player
    const player = await players.findById(playerId);

    if (!player) {
      return notFound('Player not found');
    }

    // Fetch all seasons
    const allSeasons = await seasons.list();

    // Fetch season standings for this player via repository
    const playerStandings = await seasonStandings.listByPlayer(playerId);

    // Build a map of standings by seasonId
    const standingsMap = new Map(
      playerStandings.map((s) => [s.seasonId, s])
    );

    // Show ALL seasons - those with standings get W-L-D, others get 0-0-0
    const seasonRecords = allSeasons.map((season) => {
      const standing = standingsMap.get(season.seasonId as string);
      return {
        seasonId: season.seasonId,
        seasonName: (season.name as string) || 'Unknown Season',
        seasonStatus: (season.status as string) || 'unknown',
        wins: standing ? (standing.wins || 0) : 0,
        losses: standing ? (standing.losses || 0) : 0,
        draws: standing ? (standing.draws || 0) : 0,
      };
    });

    return success({
      ...player,
      seasonRecords,
    });
  } catch (err) {
    console.error('Error fetching player:', err);
    return serverError('Failed to fetch player');
  }
};
