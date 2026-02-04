import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.pathParameters?.seasonId;

    if (!seasonId) {
      return badRequest('Season ID is required');
    }

    // Check if season exists
    const existingSeason = await dynamoDb.get({
      TableName: TableNames.SEASONS,
      Key: { seasonId },
    });

    if (!existingSeason.Item) {
      return notFound('Season not found');
    }

    // Delete the season
    await dynamoDb.delete({
      TableName: TableNames.SEASONS,
      Key: { seasonId },
    });

    // Also delete season standings
    const standingsResult = await dynamoDb.query({
      TableName: TableNames.SEASON_STANDINGS,
      KeyConditionExpression: '#seasonId = :seasonId',
      ExpressionAttributeNames: {
        '#seasonId': 'seasonId',
      },
      ExpressionAttributeValues: {
        ':seasonId': seasonId,
      },
    });

    if (standingsResult.Items && standingsResult.Items.length > 0) {
      for (const standing of standingsResult.Items) {
        await dynamoDb.delete({
          TableName: TableNames.SEASON_STANDINGS,
          Key: {
            seasonId: seasonId,
            playerId: (standing as any).playerId,
          },
        });
      }
    }

    return noContent();
  } catch (err) {
    console.error('Error deleting season:', err);
    return serverError('Failed to delete season');
  }
};
