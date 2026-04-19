import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireRole, getAuthContext } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const denied = requireRole(event, 'Fantasy');
    if (denied) return denied;

    const { sub: fantasyUserId } = getAuthContext(event);
    const { user: { fantasy } } = getRepositories();

    const picks = await fantasy.listPicksByUser(fantasyUserId);

    return success(picks);
  } catch (err) {
    console.error('Error fetching all picks:', err);
    return serverError('Failed to fetch picks');
  }
};
