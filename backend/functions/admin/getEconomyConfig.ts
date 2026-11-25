import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

/** GET /admin/economy-config — the full economy settings for the GM page. */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { user: { siteConfig } } = getRepositories();
    const settings = await siteConfig.getEconomySettings();
    return success({ settings });
  } catch (error) {
    console.error('Get economy config error:', error);
    return serverError('Failed to load economy settings');
  }
};
