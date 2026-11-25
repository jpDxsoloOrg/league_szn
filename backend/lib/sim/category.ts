/**
 * Sim category of a match (BLD-16).
 *
 * Each stipulation and match type can carry a `simCategory`. The match sim
 * (BLD-05) weights stats by it and specialties (BLD-01) match against it, so
 * neither has to guess from names.
 */
import type { APIGatewayProxyResult } from 'aws-lambda';
import { SIM_CATEGORIES, isSimCategory, type SimCategory } from '../policies/buildRules';
import { badRequest } from '../response';
import type { Match, MatchType, Stipulation } from '../repositories/types';

export const DEFAULT_SIM_CATEGORY: SimCategory = 'standard';

/** The fields of a match the category depends on. */
export type SimCategoryMatch = Pick<Match, 'stipulationId' | 'matchFormat' | 'matchType'>;

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Finds the match's match type. `matchFormat` (legacy `matchType`) stores the
 * match type's name, e.g. "Singles" or a slug like "triple-threat", so this
 * matches by id first, then by name ignoring case and punctuation.
 */
function findMatchType(match: SimCategoryMatch, matchTypes: readonly MatchType[]): MatchType | undefined {
  const format = match.matchFormat ?? match.matchType;
  if (!format) return undefined;
  const byId = matchTypes.find((matchType) => matchType.matchTypeId === format);
  if (byId) return byId;
  const wanted = normalizeName(format);
  if (!wanted) return undefined;
  return matchTypes.find((matchType) => normalizeName(matchType.name) === wanted);
}

/**
 * The match's sim category: the stipulation's category wins, then the match
 * type's, then `standard`. Unknown stored values are ignored.
 */
export function resolveSimCategory(
  match: SimCategoryMatch,
  stipulations: readonly Stipulation[],
  matchTypes: readonly MatchType[],
): SimCategory {
  const stipulation = match.stipulationId
    ? stipulations.find((item) => item.stipulationId === match.stipulationId)
    : undefined;
  const stipulationCategory: unknown = stipulation?.simCategory;
  if (isSimCategory(stipulationCategory)) return stipulationCategory;

  const matchTypeCategory: unknown = findMatchType(match, matchTypes)?.simCategory;
  if (isSimCategory(matchTypeCategory)) return matchTypeCategory;

  return DEFAULT_SIM_CATEGORY;
}

/**
 * Request validation for the stipulation / match type create and update
 * handlers: `simCategory` is optional, but when present it must be one of
 * `SIM_CATEGORIES`.
 */
export async function validateSimCategoryField(
  body: Record<string, unknown>,
): Promise<APIGatewayProxyResult | null> {
  if (body.simCategory === undefined) return null;
  if (isSimCategory(body.simCategory)) return null;
  return badRequest(`simCategory must be one of: ${SIM_CATEGORIES.join(', ')}`);
}
