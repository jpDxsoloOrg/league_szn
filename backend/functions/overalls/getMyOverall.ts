import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getRepositories } from '../../lib/repositories';
import { success, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);

    // Note: Players repo not yet migrated (Wave 4), using dynamoDb directly
    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': sub },
    });

    if (!playerResult.Items || playerResult.Items.length === 0) {
      return notFound('No player profile found for this user');
    }

    const playerId = playerResult.Items[0].playerId as string;
    const { overalls } = getRepositories();
    const overall = await overalls.findByPlayerId(playerId);

    if (!overall) {
      return notFound('No overalls submitted yet');
    }

    return success(overall);
  } catch (err) {
    console.error('Error fetching wrestler overall:', err);
    return serverError('Failed to fetch wrestler overall');
  }
};
