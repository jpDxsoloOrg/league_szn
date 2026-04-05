import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

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

    // Fetch the request
    const requestResult = await dynamoDb.get({
      TableName: TableNames.TRANSFER_REQUESTS,
      Key: { requestId },
    });

    if (!requestResult.Item) {
      return notFound('Transfer request not found');
    }

    const transferRequest = requestResult.Item;

    if (transferRequest.status !== 'pending') {
      return badRequest('Only pending transfer requests can be reviewed');
    }

    const parsed = parseBody<ReviewTransferBody>(event);
    if (parsed.error) return parsed.error;
    const { status, reviewNote } = parsed.data;

    if (status !== 'approved' && status !== 'rejected') {
      return badRequest('status must be "approved" or "rejected"');
    }

    const now = new Date().toISOString();

    // Build update
    const updateExpr: string[] = ['#status = :status', 'updatedAt = :updatedAt', 'reviewedBy = :reviewedBy'];
    const attrNames: Record<string, string> = { '#status': 'status' };
    const attrValues: Record<string, unknown> = {
      ':status': status,
      ':updatedAt': now,
      ':reviewedBy': username,
    };

    if (reviewNote) {
      updateExpr.push('reviewNote = :reviewNote');
      attrValues[':reviewNote'] = reviewNote;
    }

    await dynamoDb.update({
      TableName: TableNames.TRANSFER_REQUESTS,
      Key: { requestId },
      UpdateExpression: `SET ${updateExpr.join(', ')}`,
      ExpressionAttributeNames: attrNames,
      ExpressionAttributeValues: attrValues,
      ReturnValues: 'ALL_NEW',
    });

    // If approved, update the player's divisionId
    if (status === 'approved') {
      const playerId = transferRequest.playerId as string;
      const toDivisionId = transferRequest.toDivisionId as string;

      await dynamoDb.update({
        TableName: TableNames.PLAYERS,
        Key: { playerId },
        UpdateExpression: 'SET divisionId = :divisionId, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':divisionId': toDivisionId,
          ':updatedAt': now,
        },
      });
    }

    return success({ requestId, status, reviewedBy: username, updatedAt: now });
  } catch (err) {
    console.error('Error reviewing transfer request:', err);
    return serverError('Failed to review transfer request');
  }
};
