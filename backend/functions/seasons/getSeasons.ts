import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const result = await dynamoDb.scan({
      TableName: TableNames.SEASONS,
    });

    // Sort seasons by startDate descending (most recent first)
    const seasons = (result.Items || []).sort((a, b) => {
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    });

    return success(seasons);
  } catch (err) {
    console.error('Error fetching seasons:', err);
    return serverError('Failed to fetch seasons');
  }
};
