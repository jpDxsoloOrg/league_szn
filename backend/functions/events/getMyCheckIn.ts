import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, forbidden, notFound, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can view their event check-in');
    }

    const eventId = event.pathParameters?.eventId;
    if (!eventId) {
      return badRequest('eventId is required');
    }

    const { events, players } = getRepositories();

    // Find the caller's player record via their user sub
    const callerPlayer = await players.findByUserId(auth.sub);
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    const playerId = callerPlayer.playerId;

    const checkIn = await events.getCheckIn(eventId, playerId);

    if (!checkIn) {
      return notFound('No check-in found for this event');
    }

    return success(checkIn);
  } catch (err) {
    console.error('Error fetching event check-in:', err);
    return serverError('Failed to fetch event check-in');
  }
};
