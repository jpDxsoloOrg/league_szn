import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getOrNotFound } from '../../lib/dynamodbUtils';
import { noContent, badRequest, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const matchTypeId = event.pathParameters?.matchTypeId;
    if (!matchTypeId) {
      return badRequest('Match type ID is required');
    }

    const matchTypeResult = await getOrNotFound(
      TableNames.MATCH_TYPES,
      { matchTypeId },
      'Match type not found'
    );
    if ('notFoundResponse' in matchTypeResult) {
      return matchTypeResult.notFoundResponse;
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
