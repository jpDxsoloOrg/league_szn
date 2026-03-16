import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, getOrNotFound } from '../../lib/dynamodb';
import { noContent, badRequest, serverError, conflict } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const showId = event.pathParameters?.showId;

    if (!showId) {
      return badRequest('Show ID is required');
    }

    const showResult = await getOrNotFound(TableNames.SHOWS, { showId }, 'Show not found');
    if ('notFoundResponse' in showResult) {
      return showResult.notFoundResponse;
    }

    // Check if any events reference this show
    const eventsResult = await dynamoDb.scan({
      TableName: TableNames.EVENTS,
      FilterExpression: '#showId = :showId',
      ExpressionAttributeNames: {
        '#showId': 'showId',
      },
      ExpressionAttributeValues: {
        ':showId': showId,
      },
    });

    if (eventsResult.Items && eventsResult.Items.length > 0) {
      return conflict(
        `Cannot delete show. ${eventsResult.Items.length} event(s) are still referencing this show.`
      );
    }

    await dynamoDb.delete({
      TableName: TableNames.SHOWS,
      Key: { showId },
    });

    return noContent();
  } catch (err) {
    console.error('Error deleting show:', err);
    return serverError('Failed to delete show');
  }
};
