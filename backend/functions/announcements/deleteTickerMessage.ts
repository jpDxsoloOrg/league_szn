import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const messageId = event.pathParameters?.messageId;
    if (!messageId) return badRequest('messageId is required');

    const { content: { tickerMessages } } = getRepositories();
    // findById only returns ticker rows, so this never deletes an announcement.
    const existing = await tickerMessages.findById(messageId);
    if (!existing) return notFound('Ticker message not found');

    await tickerMessages.delete(messageId);
    return noContent();
  } catch (err) {
    console.error('Error deleting ticker message:', err);
    return serverError('Failed to delete ticker message');
  }
};
