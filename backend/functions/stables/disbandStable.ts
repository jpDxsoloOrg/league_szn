import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, getOrNotFound } from '../../lib/dynamodb';
import { success, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole, isSuperAdmin } from '../../lib/auth';

interface StableRecord {
  [key: string]: unknown;
  stableId: string;
  leaderId: string;
  memberIds: string[];
  status: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Insufficient permissions');
    }

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

    if (stable.status === 'disbanded') {
      return badRequest('Stable is already disbanded');
    }

    // Only leader or Admin can disband
    if (!isSuperAdmin(auth)) {
      const callerResult = await dynamoDb.query({
        TableName: TableNames.PLAYERS,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': auth.sub },
      });

      const callerPlayer = callerResult.Items?.[0];
      if (!callerPlayer || callerPlayer.playerId !== stable.leaderId) {
        return badRequest('Only the stable leader or an admin can disband this stable');
      }
    }

    const now = new Date().toISOString();

    // Update stable status to disbanded
    await dynamoDb.update({
      TableName: TableNames.STABLES,
      Key: { stableId },
      UpdateExpression: 'SET #status = :status, #disbandedAt = :disbandedAt, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#disbandedAt': 'disbandedAt',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':status': 'disbanded',
        ':disbandedAt': now,
        ':updatedAt': now,
      },
    });

    // Remove stableId from ALL member Player records
    const clearPromises = stable.memberIds.map((playerId) =>
      dynamoDb.update({
        TableName: TableNames.PLAYERS,
        Key: { playerId },
        UpdateExpression: 'REMOVE #stableId SET #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#stableId': 'stableId',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':updatedAt': now,
        },
      })
    );

    await Promise.all(clearPromises);

    return success({ message: 'Stable disbanded', stableId, status: 'disbanded' });
  } catch (err) {
    console.error('Error disbanding stable:', err);
    return serverError('Failed to disband stable');
  }
};
