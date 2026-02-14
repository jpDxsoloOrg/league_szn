import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const stipulationId = event.pathParameters?.stipulationId;

    if (!stipulationId) {
      return badRequest('Stipulation ID is required');
    }

    // Check if stipulation exists
    const existingStipulation = await dynamoDb.get({
      TableName: TableNames.STIPULATIONS,
      Key: { stipulationId },
    });

    if (!existingStipulation.Item) {
      return notFound('Stipulation not found');
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
