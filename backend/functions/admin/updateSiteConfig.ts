import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

const VALID_FEATURES = ['fantasy', 'challenges', 'promos', 'contenders', 'statistics'];

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }

    const { features } = JSON.parse(event.body) as {
      features: Record<string, boolean>;
    };

    if (!features || typeof features !== 'object') {
      return badRequest('features object is required');
    }

    // Validate that only valid feature keys are provided
    for (const key of Object.keys(features)) {
      if (!VALID_FEATURES.includes(key)) {
        return badRequest(`Invalid feature key: ${key}. Valid keys: ${VALID_FEATURES.join(', ')}`);
      }
      if (typeof features[key] !== 'boolean') {
        return badRequest(`Feature value for ${key} must be a boolean`);
      }
    }

    // Get existing config and merge
    const existing = await dynamoDb.get({
      TableName: TableNames.SITE_CONFIG,
      Key: { configKey: 'features' },
    });

    const currentFeatures = existing.Item?.features || {
      fantasy: true,
      challenges: true,
      promos: true,
      contenders: true,
      statistics: true,
    };

    const updatedFeatures = { ...currentFeatures, ...features };

    await dynamoDb.put({
      TableName: TableNames.SITE_CONFIG,
      Item: {
        configKey: 'features',
        features: updatedFeatures,
        updatedAt: new Date().toISOString(),
      },
    });

    return success({ features: updatedFeatures });
  } catch (error) {
    console.error('Update site config error:', error);
    return serverError('Failed to update site configuration');
  }
};
