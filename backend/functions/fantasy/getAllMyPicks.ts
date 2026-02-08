import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';
import { requireRole, getAuthContext } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const denied = requireRole(event, 'Fantasy');
    if (denied) return denied;

    const { sub: fantasyUserId } = getAuthContext(event);

    const result = await dynamoDb.queryAll({
      TableName: TableNames.FANTASY_PICKS,
      IndexName: 'UserPicksIndex',
      KeyConditionExpression: 'fantasyUserId = :uid',
      ExpressionAttributeValues: { ':uid': fantasyUserId },
    });

    // Sort by eventId descending (most recent first)
    result.sort((a, b) =>
      (b.eventId as string).localeCompare(a.eventId as string)
    );

    return success(result);
  } catch (err) {
    console.error('Error fetching all picks:', err);
    return serverError('Failed to fetch picks');
  }
};
