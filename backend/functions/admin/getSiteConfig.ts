import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { user: { siteConfig } } = getRepositories();
    const [features, ticker] = await Promise.all([siteConfig.getFeatures(), siteConfig.getTickerSettings()]);
    return success({ features, ticker });
  } catch (error) {
    console.error('Get site config error:', error);
    return serverError('Failed to get site configuration');
  }
};
