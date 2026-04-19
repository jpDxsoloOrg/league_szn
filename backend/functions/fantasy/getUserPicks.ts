import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
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
    const { user: { fantasy } } = getRepositories();

    const pick = await fantasy.findPick(eventId, fantasyUserId);

    if (!pick) {
      return notFound('No picks found for this event');
    }

    return success(pick);
  } catch (err) {
    console.error('Error fetching user picks:', err);
    return serverError('Failed to fetch picks');
  }
};
