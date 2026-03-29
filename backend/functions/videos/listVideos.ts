import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const items = await dynamoDb.scanAll({
      TableName: TableNames.VIDEOS,
    });

    items.sort((a, b) => {
      const dateA = (a.createdAt as string) || '';
      const dateB = (b.createdAt as string) || '';
      return dateB.localeCompare(dateA);
    });

    return success(items);
  } catch (err) {
    console.error('Error listing videos:', err);
    return serverError('Failed to list videos');
  }
};
