import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const result = await dynamoDb.scan({
      TableName: TableNames.TOURNAMENTS,
    });

    // Sort by creation date descending (most recent first)
    const tournaments = (result.Items || []).sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return success(tournaments);
  } catch (err) {
    console.error('Error fetching tournaments:', err);
    return serverError('Failed to fetch tournaments');
  }
};
