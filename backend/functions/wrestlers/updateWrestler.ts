import { APIGatewayProxyHandler } from 'aws-lambda';
import { updateHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import { parseBody } from '../../lib/parseBody';
import {
  WRESTLER_PROMOTIONS,
  OVERALL_CAP_MIN,
  OVERALL_CAP_MAX,
  type Wrestler,
  type WrestlerPatch,
  type WrestlerPromotion,
} from '../../lib/repositories/types';
import { badRequest } from '../../lib/response';

function isWrestlerPromotion(value: unknown): value is WrestlerPromotion {
  return (
    typeof value === 'string' &&
    (WRESTLER_PROMOTIONS as readonly string[]).includes(value)
  );
}

/**
 * P0 scope: `isInUse` is a simple admin-toggleable boolean. The cross-reference
 * to Players (clearing an assigned player's FK when toggling to `false`) is P1.
 */
const factoryHandler = updateHandlerFactory<WrestlerPatch, Wrestler>({
  repo: () => getRepositories().roster.wrestlers,
  entityName: 'wrestler',
  idParam: 'wrestlerId',
  patchFields: ['promotion', 'name', 'overallCap', 'isInUse'],
});

export const handler: APIGatewayProxyHandler = async (event, context, callback) => {
  // Pre-validate patch fields with the same rules as create. Only validate fields that are present.
  if (event.body) {
    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;
    const raw = body as Record<string, unknown>;

    if (raw.promotion !== undefined && !isWrestlerPromotion(raw.promotion)) {
      return badRequest(
        `promotion must be one of: ${WRESTLER_PROMOTIONS.join(', ')}`,
      );
    }
    if (raw.name !== undefined) {
      const name = raw.name;
      if (
        typeof name !== 'string' ||
        name.trim().length === 0 ||
        name.length > 128
      ) {
        return badRequest('name must be a non-empty string up to 128 chars');
      }
    }
    if (raw.overallCap !== undefined) {
      const cap = raw.overallCap;
      if (
        typeof cap !== 'number' ||
        !Number.isInteger(cap) ||
        cap < OVERALL_CAP_MIN ||
        cap > OVERALL_CAP_MAX
      ) {
        return badRequest(
          `overallCap must be an integer between ${OVERALL_CAP_MIN} and ${OVERALL_CAP_MAX}`,
        );
      }
    }
    if (raw.isInUse !== undefined && typeof raw.isInUse !== 'boolean') {
      return badRequest('isInUse must be a boolean');
    }
  }

  const result = await factoryHandler(event, context, callback);
  if (!result) {
    // factoryHandler never legitimately returns void for us; normalize to 500.
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Failed to update wrestler' }),
    };
  }
  return result;
};
