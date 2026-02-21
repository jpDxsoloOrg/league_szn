import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getOrNotFound } from '../../lib/dynamodbUtils';
import { noContent, badRequest, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const stipulationId = event.pathParameters?.stipulationId;

    if (!stipulationId) {
      return badRequest('Stipulation ID is required');
    }

    const stipulationResult = await getOrNotFound(
      TableNames.STIPULATIONS,
      { stipulationId },
      'Stipulation not found'
    );
    if ('notFoundResponse' in stipulationResult) {
      return stipulationResult.notFoundResponse;
    }

    await dynamoDb.delete({
      TableName: TableNames.STIPULATIONS,
      Key: { stipulationId },
    });

    return noContent();
  } catch (err) {
    console.error('Error deleting stipulation:', err);
    return serverError('Failed to delete stipulation');
  }
};
