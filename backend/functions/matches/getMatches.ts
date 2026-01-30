import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const status = event.queryStringParameters?.status;

    const result = await dynamoDb.scan({
      TableName: TableNames.MATCHES,
      ...(status && {
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
      }),
    });

    // Sort by date descending (most recent first)
    const matches = (result.Items || []).sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return success(matches);
  } catch (err) {
    console.error('Error fetching matches:', err);
    return serverError('Failed to fetch matches');
  }
};
