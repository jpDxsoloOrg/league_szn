import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { createNotification } from '../../lib/notifications';

interface ReviewTransferBody {
  status: 'approved' | 'rejected';
  reviewNote?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { username } = getAuthContext(event);
    const requestId = event.pathParameters?.requestId;

    if (!requestId) {
      return badRequest('requestId path parameter is required');
    }

    const { roster: { transfers, players } } = getRepositories();

    // Fetch the request
    const transferRequest = await transfers.findById(requestId);

    if (!transferRequest) {
      return notFound('Transfer request not found');
    }

    if (transferRequest.status !== 'pending') {
      return badRequest('Only pending transfer requests can be reviewed');
    }

    const parsed = parseBody<ReviewTransferBody>(event);
    if (parsed.error) return parsed.error;
    const { status, reviewNote } = parsed.data;

    if (status !== 'approved' && status !== 'rejected') {
      return badRequest('status must be "approved" or "rejected"');
    }

    const reviewed = await transfers.review(requestId, {
      status,
      reviewedBy: username,
      reviewNote,
    });

    const playerId = transferRequest.playerId;

    // If approved, update the player's divisionId
    if (status === 'approved') {
      const toDivisionId = transferRequest.toDivisionId;
      await players.update(playerId, { divisionId: toDivisionId });
    }

    // Look up the player's userId to send a notification
    const player = await players.findById(playerId);

    if (player?.userId) {
      const userId = player.userId;
      const message =
        status === 'approved'
          ? 'Your division transfer request has been approved.'
          : `Your division transfer request was rejected.${reviewNote ? ` Reason: ${reviewNote}` : ''}`;

      await createNotification({
        userId,
        type: 'transfer_reviewed',
        message,
        sourceId: requestId,
        sourceType: 'transfer',
      });
    }

    return success({ requestId, status, reviewedBy: username, updatedAt: reviewed.updatedAt });
  } catch (err) {
    console.error('Error reviewing transfer request:', err);
    return serverError('Failed to review transfer request');
  }
};
