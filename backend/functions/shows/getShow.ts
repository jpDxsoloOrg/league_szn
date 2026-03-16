import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const showId = event.pathParameters?.showId;

    if (!showId) {
      return badRequest('Show ID is required');
    }

    const result = await dynamoDb.get({
      TableName: TableNames.SHOWS,
      Key: { showId },
    });

    if (!result.Item) {
      return notFound('Show not found');
    }

    return success(result.Item);
  } catch (err) {
    console.error('Error fetching show:', err);
    return serverError('Failed to fetch show');
  }
};
