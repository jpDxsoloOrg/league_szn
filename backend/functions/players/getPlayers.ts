import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const result = await dynamoDb.scan({
      TableName: TableNames.PLAYERS,
    });

    return success(result.Items || []);
  } catch (err) {
    console.error('Error fetching players:', err);
    return serverError('Failed to fetch players');
  }
};
