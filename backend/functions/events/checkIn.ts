import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import type { EventCheckInStatus } from '../../lib/repositories/types';

const VALID_STATUSES: ReadonlyArray<EventCheckInStatus> = ['available', 'tentative', 'unavailable'];

interface CheckInBody {
  status: EventCheckInStatus;
}

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

    const { leagueOps: { events }, roster: { players } } = getRepositories();

    // Find the caller's player record via their user sub
    const callerPlayer = await players.findByUserId(auth.sub);
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    const playerId = callerPlayer.playerId;

    // Fetch the event
    const eventItem = await events.findById(eventId);

    if (!eventItem) {
      return notFound('Event not found');
    }

    if (eventItem.status !== 'upcoming' && eventItem.status !== 'in-progress') {
      return badRequest('Check-in is only allowed for upcoming or in-progress events');
    }

    if (!eventItem.date) {
      return serverError('Event is missing a date');
    }

    const eventTimeSeconds = Math.floor(new Date(eventItem.date).getTime() / 1000);
    if (Number.isNaN(eventTimeSeconds)) {
      return serverError('Event has an invalid date');
    }

    const checkIn = await events.upsertCheckIn(eventId, playerId, status);

    return success(checkIn);
  } catch (err) {
    console.error('Error checking in to event:', err);
    return serverError('Failed to check in to event');
  }
};
