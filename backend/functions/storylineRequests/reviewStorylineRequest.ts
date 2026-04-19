import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { createNotification } from '../../lib/notifications';

interface ReviewStorylineBody {
  status: 'acknowledged' | 'declined';
  gmNote?: string;
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

    const { storylineRequests, players } = getRepositories();

    const storylineRequest = await storylineRequests.findById(requestId);
    if (!storylineRequest) {
      return notFound('Storyline request not found');
    }

    if (storylineRequest.status !== 'pending') {
      return badRequest('Only pending storyline requests can be reviewed');
    }

    const parsed = parseBody<ReviewStorylineBody>(event);
    if (parsed.error) return parsed.error;
    const { status, gmNote } = parsed.data;

    if (status !== 'acknowledged' && status !== 'declined') {
      return badRequest('status must be "acknowledged" or "declined"');
    }

    if (status === 'declined' && (!gmNote || gmNote.trim().length === 0)) {
      return badRequest('gmNote is required when declining a storyline request');
    }

    const reviewed = await storylineRequests.review(requestId, {
      status,
      reviewedBy: username,
      gmNote: gmNote?.trim(),
    });

    // Notify requester
    const requesterId = storylineRequest.requesterId;
    const requesterPlayer = await players.findById(requesterId);

    if (requesterPlayer?.userId) {
      const userId = requesterPlayer.userId;
      const message =
        status === 'acknowledged'
          ? 'Your storyline request has been acknowledged by a GM.'
          : `Your storyline request was declined.${gmNote ? ` Reason: ${gmNote.trim()}` : ''}`;

      await createNotification({
        userId,
        type: 'storyline_request_reviewed',
        message,
        sourceId: requestId,
        sourceType: 'storyline_request',
      });
    }

    return success({ requestId: reviewed.requestId, status: reviewed.status, reviewedBy: reviewed.reviewedBy, updatedAt: reviewed.updatedAt, gmNote: reviewed.gmNote });
  } catch (err) {
    console.error('Error reviewing storyline request:', err);
    return serverError('Failed to review storyline request');
  }
};
