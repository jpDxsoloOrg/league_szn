import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const promoId = event.pathParameters?.promoId;
    if (!promoId) {
      return badRequest('promoId is required');
    }

    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;
    const { isPinned, isHidden } = body;

    const { content: { promos } } = getRepositories();

    const existing = await promos.findById(promoId);
    if (!existing) {
      return notFound('Promo not found');
    }

    const patch: Partial<Record<string, unknown>> = {};
    if (typeof isPinned === 'boolean') {
      patch.isPinned = isPinned;
    }
    if (typeof isHidden === 'boolean') {
      patch.isHidden = isHidden;
    }

    const updated = await promos.update(promoId, patch);

    return success(updated);
  } catch (err) {
    console.error('Error updating promo:', err);
    return serverError('Failed to update promo');
  }
};
