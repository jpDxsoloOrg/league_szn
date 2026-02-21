import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getOrNotFound } from '../../lib/dynamodbUtils';
import { noContent, badRequest, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.pathParameters?.seasonId;

    if (!seasonId) {
      return badRequest('Season ID is required');
    }

    const seasonResult = await getOrNotFound(TableNames.SEASONS, { seasonId }, 'Season not found');
    if ('notFoundResponse' in seasonResult) {
      return seasonResult.notFoundResponse;
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

    // Also delete season awards
    const awardsResult = await dynamoDb.query({
      TableName: TableNames.SEASON_AWARDS,
      KeyConditionExpression: '#seasonId = :seasonId',
      ExpressionAttributeNames: {
        '#seasonId': 'seasonId',
      },
      ExpressionAttributeValues: {
        ':seasonId': seasonId,
      },
    });

    if (awardsResult.Items && awardsResult.Items.length > 0) {
      for (const award of awardsResult.Items) {
        await dynamoDb.delete({
          TableName: TableNames.SEASON_AWARDS,
          Key: {
            seasonId: seasonId,
            awardId: (award as Record<string, string>).awardId,
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
