import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

/**
 * GET /admin/injury-config (INJ-01) — the current stamina and injury tunables
 * plus who saved each kept version, newest first, for the GM page.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { user: { siteConfig } } = getRepositories();
    const [settings, versions] = await Promise.all([
      siteConfig.getInjuryTunables(),
      siteConfig.listInjuryTunablesVersions(),
    ]);
    const history = versions.map(({ version, updatedAt, updatedBy }) => ({ version, updatedAt, updatedBy }));
    return success({ settings, history });
  } catch (error) {
    console.error('Get injury config error:', error);
    return serverError('Failed to load injury settings');
  }
};
