import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, getOrNotFound } from '../../lib/dynamodb';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

interface StableRecord {
  [key: string]: unknown;
  stableId: string;
  leaderId: string;
  memberIds: string[];
  status: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const roleError = requireRole(event, 'Moderator');
    if (roleError) return roleError;

    const stableId = event.pathParameters?.stableId;
    if (!stableId) {
      return badRequest('stableId is required');
    }

    const result = await getOrNotFound<StableRecord>(
      TableNames.STABLES,
      { stableId },
      'Stable not found'
    );

    if ('notFoundResponse' in result) {
      return result.notFoundResponse;
    }

    const stable = result.item;

    if (stable.status !== 'pending') {
      return badRequest(`Stable is already ${stable.status}, cannot approve`);
    }

    const now = new Date().toISOString();

    // Update stable status to approved
    await dynamoDb.update({
      TableName: TableNames.STABLES,
      Key: { stableId },
      UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':status': 'approved',
        ':updatedAt': now,
      },
    });

    // Set the leader's stableId on their player record
    await dynamoDb.update({
      TableName: TableNames.PLAYERS,
      Key: { playerId: stable.leaderId },
      UpdateExpression: 'SET #stableId = :stableId, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#stableId': 'stableId',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':stableId': stableId,
        ':updatedAt': now,
      },
    });

    return success({ message: 'Stable approved', stableId, status: 'approved' });
  } catch (err) {
    console.error('Error approving stable:', err);
    return serverError('Failed to approve stable');
  }
};
