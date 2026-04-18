import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Fantasy')) {
      return forbidden('You do not have permission to perform this action');
    }

    const userId = auth.sub;
    const { limit: limitStr, cursor } = event.queryStringParameters || {};
    const limit = limitStr ? parseInt(limitStr, 10) : 20;

    const { notifications } = getRepositories();
    const page = await notifications.listByUser(userId, limit, cursor);

    return success(page);
  } catch (err) {
    console.error('Error fetching notifications:', err);
    return serverError('Failed to fetch notifications');
  }
};
