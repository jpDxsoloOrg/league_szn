import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.pathParameters?.seasonId;
    const awardId = event.pathParameters?.awardId;

    if (!seasonId) {
      return badRequest('Season ID is required');
    }
    if (!awardId) {
      return badRequest('Award ID is required');
    }

    // Check if award exists
    const existing = await dynamoDb.get({
      TableName: TableNames.SEASON_AWARDS,
      Key: { seasonId, awardId },
    });

    if (!existing.Item) {
      return notFound('Award not found');
    }

    await dynamoDb.delete({
      TableName: TableNames.SEASON_AWARDS,
      Key: { seasonId, awardId },
    });

    return noContent();
  } catch (err) {
    console.error('Error deleting season award:', err);
    return serverError('Failed to delete season award');
  }
};
