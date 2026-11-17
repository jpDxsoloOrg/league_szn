import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { content: { tickerMessages } } = getRepositories();
    return success(await tickerMessages.list());
  } catch (err) {
    console.error('Error listing ticker messages:', err);
    return serverError('Failed to list ticker messages');
  }
};
