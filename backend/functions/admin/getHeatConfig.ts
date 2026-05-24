import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const { user: { siteConfig } } = getRepositories();
    const tunables = await siteConfig.getHeatTunables();
    return success({ tunables });
  } catch (error) {
    console.error('Get heat config error:', error);
    return serverError('Failed to load rivalry heat configuration');
  }
};
