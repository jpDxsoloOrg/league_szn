import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import type { RivalryHeatTunables } from '../../lib/repositories/SiteConfigRepository';

interface UpdateHeatConfigBody {
  tunables: Partial<RivalryHeatTunables>;
}

// Sane bounds — keep the formula expressive without letting an admin
// type "-999999" and brick rivalry rendering.
const FIELD_BOUNDS: Record<keyof RivalryHeatTunables, { min: number; max: number }> = {
  pivot: { min: 0, max: 5 },
  maxWeight: { min: 1, max: 50 },
  scoreCap: { min: 10, max: 500 },
  motnMultiplier: { min: 1, max: 5 },
  promoBase: { min: 0, max: 25 },
  promoReactionStep: { min: 0, max: 10 },
  promoBonusCap: { min: 0, max: 50 },
  promoMaxReactionCount: { min: 1, max: 50 },
};

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<UpdateHeatConfigBody>(event);
    if (parseError) return parseError;
    const { tunables } = body;

    if (!tunables || typeof tunables !== 'object') {
      return badRequest('tunables object is required');
    }

    const patch: Partial<RivalryHeatTunables> = {};
    for (const [key, value] of Object.entries(tunables)) {
      if (!(key in FIELD_BOUNDS)) {
        return badRequest(`Unknown tunable: ${key}`);
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return badRequest(`Tunable ${key} must be a finite number`);
      }
      const bounds = FIELD_BOUNDS[key as keyof RivalryHeatTunables];
      if (value < bounds.min || value > bounds.max) {
        return badRequest(`Tunable ${key} must be between ${bounds.min} and ${bounds.max}`);
      }
      patch[key as keyof RivalryHeatTunables] = value;
    }

    const { user: { siteConfig } } = getRepositories();
    const updated = await siteConfig.updateHeatTunables(patch);
    return success({ tunables: updated });
  } catch (error) {
    console.error('Update heat config error:', error);
    return serverError('Failed to update rivalry heat configuration');
  }
};
