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

    // Query all read notifications for this user
    const readItems = await dynamoDb.queryAll({
      TableName: TableNames.NOTIFICATIONS,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'isRead = :true',
      ExpressionAttributeValues: {
        ':uid': userId,
        ':true': true,
      },
    });

    if (readItems.length === 0) {
      return success({ deleted: 0 });
    }

    // Delete each read notification
    const deletePromises = readItems.map((item) =>
      dynamoDb.delete({
        TableName: TableNames.NOTIFICATIONS,
        Key: {
          userId: item.userId as string,
          createdAt: item.createdAt as string,
        },
      })
    );

    await Promise.all(deletePromises);

    return success({ deleted: readItems.length });
  } catch (err) {
    console.error('Error deleting read notifications:', err);
    return serverError('Failed to delete read notifications');
  }
};
