import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('You do not have permission to perform this action');
    }

    const userId = auth.sub;

    const result = await dynamoDb.queryAll({
      TableName: TableNames.NOTIFICATIONS,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'isRead = :false',
      ExpressionAttributeValues: {
        ':uid': userId,
        ':false': false,
      },
    });

    return success({ count: result.length });
  } catch (err) {
    console.error('Error fetching unread count:', err);
    return serverError('Failed to fetch unread count');
  }
};
