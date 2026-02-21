import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getOrNotFound } from '../../lib/dynamodbUtils';
import { noContent, badRequest, serverError, conflict } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const divisionId = event.pathParameters?.divisionId;

    if (!divisionId) {
      return badRequest('Division ID is required');
    }

    const divisionResult = await getOrNotFound(TableNames.DIVISIONS, { divisionId }, 'Division not found');
    if ('notFoundResponse' in divisionResult) {
      return divisionResult.notFoundResponse;
    }

    // Check if any players are assigned to this division
    const playersResult = await dynamoDb.scan({
      TableName: TableNames.PLAYERS,
      FilterExpression: '#divisionId = :divisionId',
      ExpressionAttributeNames: {
        '#divisionId': 'divisionId',
      },
      ExpressionAttributeValues: {
        ':divisionId': divisionId,
      },
    });

    if (playersResult.Items && playersResult.Items.length > 0) {
      return conflict(
        `Cannot delete division. ${playersResult.Items.length} player(s) are still assigned to this division.`
      );
    }

    await dynamoDb.delete({
      TableName: TableNames.DIVISIONS,
      Key: { divisionId },
    });

    return noContent();
  } catch (err) {
    console.error('Error deleting division:', err);
    return serverError('Failed to delete division');
  }
};
