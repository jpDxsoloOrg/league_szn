import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, notFound, forbidden, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Fantasy')) {
      return forbidden('You do not have permission to perform this action');
    }

    const notificationId = event.pathParameters?.notificationId;
    if (!notificationId) {
      return badRequest('notificationId is required');
    }

    const userId = auth.sub;
    const { user: { notifications } } = getRepositories();
    const notification = await notifications.findByNotificationId(notificationId);

    if (!notification || notification.userId !== userId) {
      return notFound('Notification not found');
    }

    await notifications.markRead(notification.userId, notification.createdAt);
    return success({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Error marking notification as read:', err);
    return serverError('Failed to mark notification as read');
  }
};
