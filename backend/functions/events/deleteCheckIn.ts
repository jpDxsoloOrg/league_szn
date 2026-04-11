import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { badRequest, notFound, forbidden, serverError, noContent } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can clear event check-ins');
    }

    const eventId = event.pathParameters?.eventId;
    if (!eventId) {
      return badRequest('Event ID is required');
    }

    // Find the caller's player record via their user sub
    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const callerPlayer = playerResult.Items?.[0];
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    const playerId = callerPlayer.playerId as string;

    // Fetch the event
    const eventResult = await dynamoDb.get({
      TableName: TableNames.EVENTS,
      Key: { eventId },
    });

    if (!eventResult.Item) {
      return notFound('Event not found');
    }

    const eventItem = eventResult.Item as Record<string, unknown>;
    const eventStatus = eventItem.status as string | undefined;

    if (eventStatus !== 'upcoming' && eventStatus !== 'in-progress') {
      return badRequest('Check-in can only be cleared for upcoming or in-progress events');
    }

    // Idempotent delete — does not error if the row does not exist
    await dynamoDb.delete({
      TableName: TableNames.EVENT_CHECK_INS,
      Key: { eventId, playerId },
    });

    return noContent();
  } catch (err) {
    console.error('Error deleting event check-in:', err);
    return serverError('Failed to delete event check-in');
  }
};
