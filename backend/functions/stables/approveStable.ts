import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const roleError = requireRole(event, 'Moderator');
    if (roleError) return roleError;

    const stableId = event.pathParameters?.stableId;
    if (!stableId) {
      return badRequest('stableId is required');
    }

    const { stables: stablesRepo } = getRepositories();

    const stable = await stablesRepo.findById(stableId);
    if (!stable) {
      return notFound('Stable not found');
    }

    if (stable.status !== 'pending') {
      return badRequest(`Stable is already ${stable.status}, cannot approve`);
    }

    const now = new Date().toISOString();

    // Update stable status to approved
    await stablesRepo.update(stableId, { status: 'approved' });

    // Set the leader's stableId on their player record
    // Note: using dynamoDb directly for player update to keep REMOVE semantics consistent (Wave 7)
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
