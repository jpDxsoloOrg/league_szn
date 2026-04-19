import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

const VALID_FEATURES = ['fantasy', 'challenges', 'promos', 'contenders', 'statistics', 'stables'];

interface UpdateSiteConfigBody {
  features: Record<string, boolean>;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<UpdateSiteConfigBody>(event);
    if (parseError) return parseError;
    const { features } = body;

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

    const { siteConfig } = getRepositories();
    const updatedFeatures = await siteConfig.updateFeatures(features);

    return success({ features: updatedFeatures });
  } catch (error) {
    console.error('Update site config error:', error);
    return serverError('Failed to update site configuration');
  }
};
