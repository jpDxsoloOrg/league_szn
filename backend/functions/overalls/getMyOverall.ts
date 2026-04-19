import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);

    const { players, overalls } = getRepositories();
    const player = await players.findByUserId(sub);

    if (!player) {
      return notFound('No player profile found for this user');
    }

    const overall = await overalls.findByPlayerId(player.playerId);

    if (!overall) {
      return notFound('No overalls submitted yet');
    }

    return success(overall);
  } catch (err) {
    console.error('Error fetching wrestler overall:', err);
    return serverError('Failed to fetch wrestler overall');
  }
};
