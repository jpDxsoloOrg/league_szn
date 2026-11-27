import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

/** GET /admin/episodes (staff): every episode, drafts included, newest air date first. */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { content: { episodes } } = getRepositories();
    return success(await episodes.list());
  } catch (err) {
    console.error('Error listing episodes:', err);
    return serverError('Failed to list episodes');
  }
};
