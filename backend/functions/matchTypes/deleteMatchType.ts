import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const matchTypeId = event.pathParameters?.matchTypeId;

    if (!matchTypeId) {
      return badRequest('Match type ID is required');
    }

    // Check if match type exists
    const existingMatchType = await dynamoDb.get({
      TableName: TableNames.MATCH_TYPES,
      Key: { matchTypeId },
    });

    if (!existingMatchType.Item) {
      return notFound('Match type not found');
    }

    await dynamoDb.delete({
      TableName: TableNames.MATCH_TYPES,
      Key: { matchTypeId },
    });

    return noContent();
  } catch (err) {
    console.error('Error deleting match type:', err);
    return serverError('Failed to delete match type');
  }
};
