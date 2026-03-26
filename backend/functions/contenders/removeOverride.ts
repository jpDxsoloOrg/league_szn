import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { invokeAsync } from '../../lib/asyncLambda';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.pathParameters?.championshipId;
    const playerId = event.pathParameters?.playerId;

    if (!championshipId || !playerId) {
      return badRequest('championshipId and playerId are required');
    }

    // Get the existing override
    const result = await dynamoDb.get({
      TableName: TableNames.CONTENDER_OVERRIDES,
      Key: { championshipId, playerId },
    });

    if (!result.Item || !result.Item.active) {
      return notFound('No active override found for this player and championship');
    }

    const now = new Date().toISOString();

    // Deactivate the override
    await dynamoDb.update({
      TableName: TableNames.CONTENDER_OVERRIDES,
      Key: { championshipId, playerId },
      UpdateExpression: 'SET active = :false, removedAt = :now, removedReason = :reason',
      ExpressionAttributeValues: {
        ':false': false,
        ':now': now,
        ':reason': 'removed by admin',
      },
    });

    // Trigger ranking recalculation for this championship
    try {
      await invokeAsync('contenders', { source: 'recordResult', championshipId });
    } catch (err) {
      console.warn('Failed to invoke calculateRankings async:', err);
    }

    return success({ message: 'Override removed successfully', championshipId, playerId });
  } catch (err) {
    console.error('Error removing contender override:', err);
    return serverError('Failed to remove contender override');
  }
};
