import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { siteConfig } = getRepositories();
    const features = await siteConfig.getFeatures();
    return success({ features });
  } catch (error) {
    console.error('Get site config error:', error);
    return serverError('Failed to get site configuration');
  }
};
