import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
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
    const { events, fantasy } = getRepositories();

    // Check event status
    const eventItem = await events.findById(eventId);

    if (!eventItem) {
      return notFound('Event not found');
    }

    if (eventItem.status === 'completed') {
      return badRequest('Cannot clear picks for a completed event');
    }

    if (eventItem.fantasyLocked) {
      return badRequest('Picks are locked for this event');
    }

    await fantasy.deletePick(eventId, fantasyUserId);

    return noContent();
  } catch (err) {
    console.error('Error clearing picks:', err);
    return serverError('Failed to clear picks');
  }
};
