import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { badRequest, notFound, noContent, serverError } from '../../lib/response';
import { requireRole, getAuthContext } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const denied = requireRole(event, 'Fantasy');
    if (denied) return denied;

    const eventId = event.pathParameters?.eventId;
    if (!eventId) {
      return badRequest('Event ID is required');
    }

    const { sub: fantasyUserId } = getAuthContext(event);

    // Check event status
    const eventResult = await dynamoDb.get({
      TableName: TableNames.EVENTS,
      Key: { eventId },
    });

    if (!eventResult.Item) {
      return notFound('Event not found');
    }

    if (eventResult.Item.status === 'completed') {
      return badRequest('Cannot clear picks for a completed event');
    }

    await dynamoDb.delete({
      TableName: TableNames.FANTASY_PICKS,
      Key: { eventId, fantasyUserId },
    });

    return noContent();
  } catch (err) {
    console.error('Error clearing picks:', err);
    return serverError('Failed to clear picks');
  }
};
