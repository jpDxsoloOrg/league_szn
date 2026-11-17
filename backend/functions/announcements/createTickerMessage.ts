import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { created, badRequest, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { validateCreateTickerMessage, type TickerMessageBody } from './tickerMessageValidation';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { data, error: parseError } = parseBody<TickerMessageBody>(event);
    if (parseError) return parseError;

    const checked = validateCreateTickerMessage(data);
    if (checked.error !== undefined) return badRequest(checked.error);

    const auth = getAuthContext(event);
    const { content: { tickerMessages } } = getRepositories();
    const message = await tickerMessages.create({
      ...checked.value,
      createdBy: auth.username || auth.sub,
    });
    return created(message);
  } catch (err) {
    console.error('Error creating ticker message:', err);
    return serverError('Failed to create ticker message');
  }
};
