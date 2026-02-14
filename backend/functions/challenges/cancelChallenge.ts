import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError, forbidden } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    const isAdmin = hasRole(auth, 'Admin');

    const challengeId = event.pathParameters?.challengeId;
    if (!challengeId) {
      return badRequest('challengeId is required');
    }

    const result = await dynamoDb.get({
      TableName: TableNames.CHALLENGES,
      Key: { challengeId },
    });
    const challenge = result.Item;
    if (!challenge) {
      return notFound('Challenge not found');
    }

    const adminCancellableStatuses = ['pending', 'countered', 'accepted'];
    if (isAdmin && !adminCancellableStatuses.includes(challenge.status as string)) {
      return badRequest('Only pending, countered, or accepted challenges can be cancelled by admin');
    }
    if (!isAdmin && challenge.status !== 'pending') {
      return badRequest('Only pending challenges can be cancelled');
    }

    // Verify the canceller is the challenger (or admin)
    if (!isAdmin) {
      const playerResult = await dynamoDb.query({
        TableName: TableNames.PLAYERS,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': auth.sub },
      });
      const player = playerResult.Items?.[0];
      if (!player || player.playerId !== challenge.challengerId) {
        return forbidden('Only the challenger or an admin can cancel a challenge');
      }
    }

    const now = new Date().toISOString();

    await dynamoDb.update({
      TableName: TableNames.CHALLENGES,
      Key: { challengeId },
      UpdateExpression: 'SET #s = :status, updatedAt = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':status': 'cancelled',
        ':now': now,
      },
    });

    return success({ ...challenge, status: 'cancelled', updatedAt: now });
  } catch (err) {
    console.error('Error cancelling challenge:', err);
    return serverError('Failed to cancel challenge');
  }
};
