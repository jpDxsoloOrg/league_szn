import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
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

    const { events, players } = getRepositories();

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
      return badRequest('Check-in can only be cleared for upcoming or in-progress events');
    }

    // Idempotent delete -- does not error if the row does not exist
    await events.deleteCheckIn(eventId, playerId);

    return noContent();
  } catch (err) {
    console.error('Error deleting event check-in:', err);
    return serverError('Failed to delete event check-in');
  }
};
