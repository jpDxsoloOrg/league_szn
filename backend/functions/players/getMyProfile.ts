import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);

    const { players, seasons, seasonStandings } = getRepositories();

    const player = await players.findByUserId(sub);

    if (!player) {
      return notFound('No player profile found for this user');
    }

    const playerId = player.playerId;

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
    console.error('Error fetching player profile:', err);
    return serverError('Failed to fetch player profile');
  }
};
