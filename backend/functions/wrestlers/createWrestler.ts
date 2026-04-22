import { createHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import {
  WRESTLER_PROMOTIONS,
  OVERALL_CAP_MIN,
  OVERALL_CAP_MAX,
  type Wrestler,
  type WrestlerCreateInput,
  type WrestlerPromotion,
} from '../../lib/repositories/types';
import { badRequest } from '../../lib/response';

function isWrestlerPromotion(value: unknown): value is WrestlerPromotion {
  return (
    typeof value === 'string' &&
    (WRESTLER_PROMOTIONS as readonly string[]).includes(value)
  );
}

export const handler = createHandlerFactory<WrestlerCreateInput, Wrestler>({
  repo: () => getRepositories().roster.wrestlers,
  entityName: 'wrestler',
  requiredFields: ['promotion', 'name', 'overallCap'],
  validate: async (body) => {
    const { promotion, name, overallCap } = body;

    if (!isWrestlerPromotion(promotion)) {
      return badRequest(
        `promotion must be one of: ${WRESTLER_PROMOTIONS.join(', ')}`,
      );
    }
    if (
      typeof name !== 'string' ||
      name.trim().length === 0 ||
      name.length > 128
    ) {
      return badRequest('name must be a non-empty string up to 128 chars');
    }
    if (
      typeof overallCap !== 'number' ||
      !Number.isInteger(overallCap) ||
      overallCap < OVERALL_CAP_MIN ||
      overallCap > OVERALL_CAP_MAX
    ) {
      return badRequest(
        `overallCap must be an integer between ${OVERALL_CAP_MIN} and ${OVERALL_CAP_MAX}`,
      );
    }

    const repo = getRepositories().roster.wrestlers;
    const existing = await repo.findByName(promotion, name);
    if (existing) {
      return badRequest(
        'a wrestler with this promotion + name already exists (case-insensitive)',
      );
    }
    return null;
  },
});
