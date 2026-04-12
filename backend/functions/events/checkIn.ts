import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

type CheckInStatus = 'available' | 'tentative' | 'unavailable';

interface CheckInBody {
  status: CheckInStatus;
}

const VALID_STATUSES: ReadonlyArray<CheckInStatus> = ['available', 'tentative', 'unavailable'];

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can check in to events');
    }

    const eventId = event.pathParameters?.eventId;
    if (!eventId) {
      return badRequest('Event ID is required');
    }

    const { data: body, error: parseError } = parseBody<CheckInBody>(event);
    if (parseError) return parseError;

    const status = body.status;
    if (!status || !VALID_STATUSES.includes(status)) {
      return badRequest('status must be one of available, tentative, unavailable');
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
      return badRequest('Check-in is only allowed for upcoming or in-progress events');
    }

    const eventDate = eventItem.date as string | undefined;
    if (!eventDate) {
      return serverError('Event is missing a date');
    }

    const eventTimeSeconds = Math.floor(new Date(eventDate).getTime() / 1000);
    if (Number.isNaN(eventTimeSeconds)) {
      return serverError('Event has an invalid date');
    }
    const ttl = eventTimeSeconds + 30 * 86400;

    const checkIn = {
      eventId,
      playerId,
      status,
      checkedInAt: new Date().toISOString(),
      ttl,
    };

    await dynamoDb.put({
      TableName: TableNames.EVENT_CHECK_INS,
      Item: checkIn,
    });

    return success(checkIn);
  } catch (err) {
    console.error('Error checking in to event:', err);
    return serverError('Failed to check in to event');
  }
};
