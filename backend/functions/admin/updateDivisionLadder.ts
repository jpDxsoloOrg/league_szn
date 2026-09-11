import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { sortDivisionsByRank } from '../../lib/divisionLadder';
import type { DivisionLadderRules } from '../../lib/repositories/SiteConfigRepository';

interface UpdateDivisionLadderBody {
  rules?: Partial<DivisionLadderRules>;
  /** Division ids bottom → top. Listed divisions get `rank = index`. */
  order?: string[];
}

const RECENT_MOVEMENTS_LIMIT = 20;

type NumericRule = Exclude<keyof DivisionLadderRules, 'enabled'>;

// Streak thresholds must be integers in a sane range so a typo can't make
// promotion impossible ("win 9999 in a row") or trivial ("win 0 in a row").
const FIELD_BOUNDS: Record<NumericRule, { min: number; max: number }> = {
  promoteWinStreak: { min: 2, max: 20 },
  demoteLossStreak: { min: 2, max: 20 },
};

function isNumericRule(key: string): key is NumericRule {
  return key in FIELD_BOUNDS;
}

/** Builds the rules patch, or a 400 when any field is unknown or out of bounds. */
function validateRules(
  rules: unknown,
): { patch: Partial<DivisionLadderRules>; error?: undefined } | { patch?: undefined; error: APIGatewayProxyResult } {
  if (typeof rules !== 'object' || rules === null || Array.isArray(rules)) {
    return { error: badRequest('rules must be an object') };
  }

  const patch: Partial<DivisionLadderRules> = {};
  for (const [key, value] of Object.entries(rules)) {
    if (key === 'enabled') {
      if (typeof value !== 'boolean') {
        return { error: badRequest('Rule enabled must be a boolean') };
      }
      patch.enabled = value;
      continue;
    }
    if (!isNumericRule(key)) {
      return { error: badRequest(`Unknown rule: ${key}`) };
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return { error: badRequest(`Rule ${key} must be an integer`) };
    }
    const bounds = FIELD_BOUNDS[key];
    if (value < bounds.min || value > bounds.max) {
      return { error: badRequest(`Rule ${key} must be between ${bounds.min} and ${bounds.max}`) };
    }
    patch[key] = value;
  }
  return { patch };
}

/**
 * Validates `order`: an array of unique strings, each an existing division id.
 * It may be a subset of all divisions — listed divisions get `rank = index`
 * and unlisted divisions are left untouched (they keep whatever rank they
 * had, or stay unranked). The admin screen always sends the full ladder, so
 * in practice this is a permutation; the subset rule just keeps the endpoint
 * forgiving for scripted callers.
 */
function validateOrder(order: unknown, existingIds: Set<string>): APIGatewayProxyResult | null {
  if (!Array.isArray(order)) {
    return badRequest('order must be an array of division ids');
  }
  const seen = new Set<string>();
  for (const id of order) {
    if (typeof id !== 'string' || id.length === 0) {
      return badRequest('order must contain only non-empty division ids');
    }
    if (!existingIds.has(id)) {
      return badRequest(`Unknown division in order: ${id}`);
    }
    if (seen.has(id)) {
      return badRequest(`Duplicate division in order: ${id}`);
    }
    seen.add(id);
  }
  return null;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<UpdateDivisionLadderBody>(event);
    if (parseError) return parseError;
    const { rules, order } = body;

    if (rules === undefined && order === undefined) {
      return badRequest('Provide rules and/or order');
    }

    let rulesPatch: Partial<DivisionLadderRules> = {};
    if (rules !== undefined) {
      const validated = validateRules(rules);
      if (validated.error) return validated.error;
      rulesPatch = validated.patch;
    }

    const {
      user: { siteConfig },
      leagueOps: { divisions, divisionMovements },
    } = getRepositories();

    if (order !== undefined) {
      const existing = await divisions.list();
      const existingIds = new Set(existing.map((division) => division.divisionId));
      const orderError = validateOrder(order, existingIds);
      if (orderError) return orderError;

      await Promise.all(
        order.map((divisionId, index) => divisions.update(divisionId, { rank: index })),
      );
    }

    const updatedRules =
      Object.keys(rulesPatch).length > 0
        ? await siteConfig.updateDivisionLadderRules(rulesPatch)
        : await siteConfig.getDivisionLadderRules();

    const [allDivisions, recentMovements] = await Promise.all([
      divisions.list(),
      divisionMovements.listRecent(RECENT_MOVEMENTS_LIMIT),
    ]);

    return success({
      rules: updatedRules,
      divisions: sortDivisionsByRank(allDivisions),
      recentMovements,
    });
  } catch (error) {
    console.error('Update division ladder error:', error);
    return serverError('Failed to update division ladder');
  }
};
