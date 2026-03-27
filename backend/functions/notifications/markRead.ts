import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, notFound, forbidden, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('You do not have permission to perform this action');
    }

    const notificationId = event.pathParameters?.notificationId;
    if (!notificationId) {
      return badRequest('notificationId is required');
    }

    // Look up the notification by its notificationId via the GSI
    const gsiResult = await dynamoDb.query({
      TableName: TableNames.NOTIFICATIONS,
      IndexName: 'NotificationIdIndex',
      KeyConditionExpression: 'notificationId = :nid',
      ExpressionAttributeValues: { ':nid': notificationId },
    });

    const notification = gsiResult.Items?.[0];
    if (!notification) {
      return notFound('Notification not found');
    }

    // Verify ownership
    const userId = auth.sub;
    if (notification.userId !== userId) {
      return notFound('Notification not found');
    }

    const now = new Date().toISOString();

    await dynamoDb.update({
      TableName: TableNames.NOTIFICATIONS,
      Key: {
        userId: notification.userId as string,
        createdAt: notification.createdAt as string,
      },
      UpdateExpression: 'SET isRead = :true, updatedAt = :now',
      ExpressionAttributeValues: {
        ':true': true,
        ':now': now,
      },
    });

    return success({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Error marking notification as read:', err);
    return serverError('Failed to mark notification as read');
  }
};
