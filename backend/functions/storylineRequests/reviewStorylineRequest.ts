import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
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

    const requestResult = await dynamoDb.get({
      TableName: TableNames.STORYLINE_REQUESTS,
      Key: { requestId },
    });

    if (!requestResult.Item) {
      return notFound('Storyline request not found');
    }

    const storylineRequest = requestResult.Item;

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

    const now = new Date().toISOString();

    const updateExpr: string[] = ['#status = :status', 'updatedAt = :updatedAt', 'reviewedBy = :reviewedBy'];
    const attrNames: Record<string, string> = { '#status': 'status' };
    const attrValues: Record<string, unknown> = {
      ':status': status,
      ':updatedAt': now,
      ':reviewedBy': username,
    };

    if (gmNote && gmNote.trim().length > 0) {
      updateExpr.push('gmNote = :gmNote');
      attrValues[':gmNote'] = gmNote.trim();
    }

    await dynamoDb.update({
      TableName: TableNames.STORYLINE_REQUESTS,
      Key: { requestId },
      UpdateExpression: `SET ${updateExpr.join(', ')}`,
      ExpressionAttributeNames: attrNames,
      ExpressionAttributeValues: attrValues,
      ReturnValues: 'ALL_NEW',
    });

    // Notify requester
    const requesterId = storylineRequest.requesterId as string;
    const playerResult = await dynamoDb.get({
      TableName: TableNames.PLAYERS,
      Key: { playerId: requesterId },
    });

    if (playerResult.Item?.userId) {
      const userId = playerResult.Item.userId as string;
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

    return success({ requestId, status, reviewedBy: username, updatedAt: now, gmNote: gmNote?.trim() });
  } catch (err) {
    console.error('Error reviewing storyline request:', err);
    return serverError('Failed to review storyline request');
  }
};
