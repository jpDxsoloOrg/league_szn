import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.pathParameters?.seasonId;
    if (!seasonId) {
      return badRequest('Season ID is required');
    }

    const { seasons, seasonAwards } = getRepositories();
    const existing = await seasons.findById(seasonId);
    if (!existing) {
      return notFound('Season not found');
    }

    // Delete the season
    await seasons.delete(seasonId);

    // Also delete season standings
    // Note: SeasonStandings repo not yet migrated (Wave 4/5), using dynamoDb directly
    const standingsResult = await dynamoDb.query({
      TableName: TableNames.SEASON_STANDINGS,
      KeyConditionExpression: '#seasonId = :seasonId',
      ExpressionAttributeNames: { '#seasonId': 'seasonId' },
      ExpressionAttributeValues: { ':seasonId': seasonId },
    });

    if (standingsResult.Items && standingsResult.Items.length > 0) {
      for (const standing of standingsResult.Items) {
        await dynamoDb.delete({
          TableName: TableNames.SEASON_STANDINGS,
          Key: {
            seasonId: seasonId,
            playerId: (standing as Record<string, string>).playerId,
          },
        });
      }
    }

    // Delete season awards via repository
    await seasonAwards.deleteAllForSeason(seasonId);

    return noContent();
  } catch (err) {
    console.error('Error deleting season:', err);
    return serverError('Failed to delete season');
  }
};
