import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const result = await dynamoDb.scan({
      TableName: TableNames.MATCH_TYPES,
    });

    return success(result.Items || []);
  } catch (err) {
    console.error('Error fetching match types:', err);
    return serverError('Failed to fetch match types');
  }
};
