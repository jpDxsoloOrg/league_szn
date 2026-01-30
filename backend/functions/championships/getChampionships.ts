import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const result = await dynamoDb.scan({
      TableName: TableNames.CHAMPIONSHIPS,
    });

    // Filter active championships by default
    const championships = (result.Items || []).filter(c => c.isActive !== false);

    return success(championships);
  } catch (err) {
    console.error('Error fetching championships:', err);
    return serverError('Failed to fetch championships');
  }
};
