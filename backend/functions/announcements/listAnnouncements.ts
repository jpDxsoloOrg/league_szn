import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { content: { announcements } } = getRepositories();
    const items = await announcements.list();
    return success(items);
  } catch (err) {
    console.error('Error listing announcements:', err);
    return serverError('Failed to list announcements');
  }
};
