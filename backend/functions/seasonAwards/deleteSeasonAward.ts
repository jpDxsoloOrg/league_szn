import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getOrNotFound } from '../../lib/dynamodbUtils';
import { noContent, badRequest, serverError } from '../../lib/response';

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

    const awardResult = await getOrNotFound(
      TableNames.SEASON_AWARDS,
      { seasonId, awardId },
      'Award not found'
    );
    if ('notFoundResponse' in awardResult) {
      return awardResult.notFoundResponse;
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
