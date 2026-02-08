import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
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

    const result = await dynamoDb.get({
      TableName: TableNames.FANTASY_PICKS,
      Key: { eventId, fantasyUserId },
    });

    if (!result.Item) {
      return notFound('No picks found for this event');
    }

    return success(result.Item);
  } catch (err) {
    console.error('Error fetching user picks:', err);
    return serverError('Failed to fetch picks');
  }
};
