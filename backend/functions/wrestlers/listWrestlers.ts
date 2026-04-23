import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import {
  WRESTLER_PROMOTIONS,
  type Wrestler,
  type WrestlerPromotion,
} from '../../lib/repositories/types';
import { badRequest, serverError, success } from '../../lib/response';

function isWrestlerPromotion(value: unknown): value is WrestlerPromotion {
  return (
    typeof value === 'string' &&
    (WRESTLER_PROMOTIONS as readonly string[]).includes(value)
  );
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const qs = event.queryStringParameters ?? {};
    const promotionParam = qs.promotion;
    const availableParam = qs.available;

    const wantAvailable = availableParam === 'true';

    const repo = getRepositories().roster.wrestlers;

    if (promotionParam !== undefined && promotionParam !== null && promotionParam !== '') {
      if (!isWrestlerPromotion(promotionParam)) {
        return badRequest(
          `promotion must be one of: ${WRESTLER_PROMOTIONS.join(', ')}`,
        );
      }
      const byPromotion = await repo.listByPromotion(promotionParam);
      const result: Wrestler[] = wantAvailable
        ? byPromotion.filter((w) => w.isInUse === false)
        : byPromotion;
      return success(result);
    }

    if (wantAvailable) {
      const items = await repo.listAvailable();
      return success(items);
    }

    const items = await repo.list();
    return success(items);
  } catch (err) {
    console.error('Error fetching wrestlers list:', err);
    return serverError('Failed to fetch wrestlers list');
  }
};
