import { APIGatewayProxyHandler } from 'aws-lambda';
import { QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

interface AppNotification {
  userId: string;
  createdAt: string;
  notificationId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  linkUrl?: string;
  linkText?: string;
  metadata?: Record<string, unknown>;
  updatedAt: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Fantasy')) {
      return forbidden('You do not have permission to perform this action');
    }

    const userId = auth.sub;
    const { limit: limitStr, cursor } = event.queryStringParameters || {};
    const limit = limitStr ? parseInt(limitStr, 10) : 20;

    const queryParams: QueryCommandInput = {
      TableName: TableNames.NOTIFICATIONS,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ScanIndexForward: false,
      Limit: limit,
    };

    if (cursor) {
      queryParams.ExclusiveStartKey = { userId, createdAt: cursor };
    }

    const result = await dynamoDb.query(queryParams);
    const notifications = (result.Items || []) as unknown as AppNotification[];
    const lastKey = result.LastEvaluatedKey as Record<string, string> | undefined;
    const nextCursor = lastKey?.createdAt || null;

    return success({ notifications, nextCursor });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    return serverError('Failed to fetch notifications');
  }
};
