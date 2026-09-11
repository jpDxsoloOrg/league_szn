import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { createNotification } from '../../lib/notifications';

/**
 * POST /players/{playerId}/reinstate
 * Removes the player's `suspension` attribute. 404 when the player does not
 * exist or is not currently suspended.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    const { roster } = getRepositories();
    const player = await roster.players.findById(playerId);
    if (!player) return notFound('Player not found');
    if (!player.suspension) return notFound('Player is not suspended');

    await roster.players.clearSuspension(playerId);
    const updated = await roster.players.findById(playerId);

    if (player.userId) {
      await createNotification({
        userId: player.userId,
        type: 'player_reinstated',
        message: 'Your suspension has been lifted. You are eligible to compete again.',
        sourceId: playerId,
        sourceType: 'suspension',
      });
    }

    return success(updated);
  } catch (err) {
    console.error('Error reinstating player:', err);
    return serverError('Failed to reinstate player');
  }
};
