import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { recomputeRivalryHeat } from '../../lib/services/recomputeRivalryHeat';
import type { PromoType } from '../../lib/repositories/types';

const HEAT_CONTRIBUTING_TYPES: ReadonlyArray<PromoType> = ['call-out', 'rivalry'];

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const promoId = event.pathParameters?.promoId;
    if (!promoId) {
      return badRequest('promoId is required');
    }

    const { content: { promos } } = getRepositories();

    const promo = await promos.findById(promoId);
    if (!promo) {
      return notFound('Promo not found');
    }

    await promos.delete(promoId);

    // Removing a heat-contributing promo should pull the heat back down
    // (or up, if its trash reactions were dragging it).
    if (promo.rivalryId && HEAT_CONTRIBUTING_TYPES.includes(promo.promoType)) {
      try {
        await recomputeRivalryHeat(promo.rivalryId);
      } catch (heatErr) {
        console.error('Failed to recompute rivalry heat after promo delete:', heatErr);
      }
    }

    return noContent();
  } catch (err) {
    console.error('Error deleting promo:', err);
    return serverError('Failed to delete promo');
  }
};
