import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface CreateTransferRequestBody {
  toDivisionId: string;
  reason: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);

    // Look up the player by userId
    const player = await getRepositories().roster.players.findByUserId(sub);

    if (!player) {
      return notFound('No player profile found for this user');
    }

    const playerId = player.playerId;
    const fromDivisionId = player.divisionId;

    if (!fromDivisionId) {
      return badRequest('You are not currently assigned to a division');
    }

    const parsed = parseBody<CreateTransferRequestBody>(event);
    if (parsed.error) return parsed.error;
    const { toDivisionId, reason } = parsed.data;

    if (!toDivisionId || typeof toDivisionId !== 'string') {
      return badRequest('toDivisionId is required');
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return badRequest('reason is required');
    }

    if (toDivisionId === fromDivisionId) {
      return badRequest('Target division must be different from your current division');
    }

    // Validate target division exists
    const division = await getRepositories().leagueOps.divisions.findById(toDivisionId);

    if (!division) {
      return notFound('Target division not found');
    }

    // Check for existing pending request
    const pendingRequests = await getRepositories().roster.transfers.listPendingByPlayer(playerId);

    if (pendingRequests.length > 0) {
      return badRequest('You already have a pending transfer request. Cancel it before submitting a new one.');
    }

    const item = await getRepositories().roster.transfers.create({
      playerId,
      fromDivisionId,
      toDivisionId,
      reason: reason.trim(),
    });

    return success(item);
  } catch (err) {
    console.error('Error creating transfer request:', err);
    return serverError('Failed to create transfer request');
  }
};
