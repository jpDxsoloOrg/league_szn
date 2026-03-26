import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, getOrNotFound } from '../../lib/dynamodb';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

interface StableRecord {
  [key: string]: unknown;
  stableId: string;
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
      return badRequest(`Stable is already ${stable.status}, cannot reject`);
    }

    const now = new Date().toISOString();

    await dynamoDb.update({
      TableName: TableNames.STABLES,
      Key: { stableId },
      UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt, #disbandedAt = :disbandedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
        '#disbandedAt': 'disbandedAt',
      },
      ExpressionAttributeValues: {
        ':status': 'disbanded',
        ':updatedAt': now,
        ':disbandedAt': now,
      },
    });

    return success({ message: 'Stable rejected', stableId, status: 'disbanded' });
  } catch (err) {
    console.error('Error rejecting stable:', err);
    return serverError('Failed to reject stable');
  }
};
