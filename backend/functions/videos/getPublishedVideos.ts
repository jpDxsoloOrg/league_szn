import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const category = event.queryStringParameters?.category;

    const items = await dynamoDb.queryAll({
      TableName: TableNames.VIDEOS,
      IndexName: 'PublishedIndex',
      KeyConditionExpression: 'isPublished = :pub',
      ExpressionAttributeValues: {
        ':pub': 'true',
      },
      ScanIndexForward: false,
    });

    const filtered = category
      ? items.filter((item) => item.category === category)
      : items;

    return success(filtered);
  } catch (err) {
    console.error('Error fetching published videos:', err);
    return serverError('Failed to fetch videos');
  }
};
