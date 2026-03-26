import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

const DEFAULT_CONFIG = {
  fantasy: true,
  challenges: true,
  promos: true,
  contenders: true,
  statistics: true,
  stables: true,
};

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const result = await dynamoDb.get({
      TableName: TableNames.SITE_CONFIG,
      Key: { configKey: 'features' },
    });

    if (result.Item) {
      return success({ features: result.Item.features || DEFAULT_CONFIG });
    }

    return success({ features: DEFAULT_CONFIG });
  } catch (error) {
    console.error('Get site config error:', error);
    return serverError('Failed to get site configuration');
  }
};
