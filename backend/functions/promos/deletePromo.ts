import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const promoId = event.pathParameters?.promoId;
    if (!promoId) {
      return badRequest('promoId is required');
    }

    const { promos } = getRepositories();

    const promo = await promos.findById(promoId);
    if (!promo) {
      return notFound('Promo not found');
    }

    await promos.delete(promoId);

    return noContent();
  } catch (err) {
    console.error('Error deleting promo:', err);
    return serverError('Failed to delete promo');
  }
};
