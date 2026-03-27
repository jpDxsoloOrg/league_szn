import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Fantasy')) {
      return forbidden('You do not have permission to perform this action');
    }

    const userId = auth.sub;

    // Query all unread notifications for this user
    const unreadItems = await dynamoDb.queryAll({
      TableName: TableNames.NOTIFICATIONS,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'isRead = :false',
      ExpressionAttributeValues: {
        ':uid': userId,
        ':false': false,
      },
    });

    if (unreadItems.length === 0) {
      return success({ updated: 0 });
    }

    const now = new Date().toISOString();

    // Update each unread notification to isRead=true
    const updatePromises = unreadItems.map((item) =>
      dynamoDb.update({
        TableName: TableNames.NOTIFICATIONS,
        Key: {
          userId: item.userId as string,
          createdAt: item.createdAt as string,
        },
        UpdateExpression: 'SET isRead = :true, updatedAt = :now',
        ExpressionAttributeValues: {
          ':true': true,
          ':now': now,
        },
      })
    );

    await Promise.all(updatePromises);

    return success({ updated: unreadItems.length });
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
    return serverError('Failed to mark all notifications as read');
  }
};
