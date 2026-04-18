import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, serverError, conflict } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const showId = event.pathParameters?.showId;
    if (!showId) {
      return badRequest('Show ID is required');
    }

    const { shows } = getRepositories();
    const show = await shows.findById(showId);
    if (!show) {
      return badRequest('Show not found');
    }

    // Check if any events reference this show
    // Note: Events repo not yet migrated (Wave 4), using dynamoDb directly
    const eventsResult = await dynamoDb.scan({
      TableName: TableNames.EVENTS,
      FilterExpression: '#showId = :showId',
      ExpressionAttributeNames: { '#showId': 'showId' },
      ExpressionAttributeValues: { ':showId': showId },
    });

    if (eventsResult.Items && eventsResult.Items.length > 0) {
      return conflict(
        `Cannot delete show. ${eventsResult.Items.length} event(s) are still referencing this show.`
      );
    }

    await shows.delete(showId);
    return noContent();
  } catch (err) {
    console.error('Error deleting show:', err);
    return serverError('Failed to delete show');
  }
};
