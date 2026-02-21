import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getOrNotFound } from '../../lib/dynamodbUtils';
import { noContent, badRequest, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.pathParameters?.championshipId;

    if (!championshipId) {
      return badRequest('Championship ID is required');
    }

    const championshipResult = await getOrNotFound(
      TableNames.CHAMPIONSHIPS,
      { championshipId },
      'Championship not found'
    );
    if ('notFoundResponse' in championshipResult) {
      return championshipResult.notFoundResponse;
    }

    // Delete the championship
    await dynamoDb.delete({
      TableName: TableNames.CHAMPIONSHIPS,
      Key: { championshipId },
    });

    // Also delete championship history
    const historyResult = await dynamoDb.query({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      KeyConditionExpression: '#championshipId = :championshipId',
      ExpressionAttributeNames: {
        '#championshipId': 'championshipId',
      },
      ExpressionAttributeValues: {
        ':championshipId': championshipId,
      },
    });

    if (historyResult.Items && historyResult.Items.length > 0) {
      for (const history of historyResult.Items) {
        await dynamoDb.delete({
          TableName: TableNames.CHAMPIONSHIP_HISTORY,
          Key: {
            championshipId: championshipId,
            wonDate: (history as any).wonDate,
          },
        });
      }
    }

    return noContent();
  } catch (err) {
    console.error('Error deleting championship:', err);
    return serverError('Failed to delete championship');
  }
};
