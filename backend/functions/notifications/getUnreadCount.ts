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
    const { notifications } = getRepositories();
    const count = await notifications.countUnread(userId);

    return success({ count });
  } catch (err) {
    console.error('Error fetching unread count:', err);
    return serverError('Failed to fetch unread count');
  }
};
