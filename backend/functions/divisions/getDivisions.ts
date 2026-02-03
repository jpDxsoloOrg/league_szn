import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const result = await dynamoDb.scan({
      TableName: TableNames.DIVISIONS,
    });

    return success(result.Items || []);
  } catch (err) {
    console.error('Error fetching divisions:', err);
    return serverError('Failed to fetch divisions');
  }
};
