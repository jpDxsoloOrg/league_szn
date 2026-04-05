import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);

    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': sub,
      },
    });

    if (!playerResult.Items || playerResult.Items.length === 0) {
      return notFound('No player profile found for this user');
    }

    const player = playerResult.Items[0];
    const playerId = player.playerId as string;

    const overallResult = await dynamoDb.get({
      TableName: TableNames.WRESTLER_OVERALLS,
      Key: { playerId },
    });

    if (!overallResult.Item) {
      return notFound('No overalls submitted yet');
    }

    return success(overallResult.Item);
  } catch (err) {
    console.error('Error fetching wrestler overall:', err);
    return serverError('Failed to fetch wrestler overall');
  }
};
