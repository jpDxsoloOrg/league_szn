import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, NotFoundError } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { validateUpdateTickerMessage, type TickerMessageBody } from './tickerMessageValidation';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const messageId = event.pathParameters?.messageId;
    if (!messageId) return badRequest('messageId is required');

    const { data, error: parseError } = parseBody<TickerMessageBody>(event);
    if (parseError) return parseError;

    const { content: { tickerMessages } } = getRepositories();
    const existing = await tickerMessages.findById(messageId);
    if (!existing) return notFound('Ticker message not found');

    const checked = validateUpdateTickerMessage(data, existing);
    if (checked.error !== undefined) return badRequest(checked.error);

    return success(await tickerMessages.update(messageId, checked.value));
  } catch (err) {
    if (err instanceof NotFoundError) return notFound('Ticker message not found');
    console.error('Error updating ticker message:', err);
    return serverError('Failed to update ticker message');
  }
};
