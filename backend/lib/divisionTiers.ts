import type { Division } from './repositories/types';

/**
 * Division tiers (DMV-01).
 *
 * - `tier` is a positive integer; 1 is the top of the card.
 * - Divisions sharing a tier are siblings (e.g. Raw and SmackDown at 1).
 * - Developmental divisions sit below every tiered division, whatever
 *   `tier` they carry. All developmental divisions are siblings.
 * - A non-developmental division with no tier is outside the ladder: it has
 *   nothing above or below it and is never returned as a neighbour.
 */

export const MIN_DIVISION_TIER = 1;
export const MAX_DIVISION_TIER = 99;

type TierFields = Pick<Division, 'divisionId' | 'tier' | 'isDevelopmental' | 'name'>;

/** The division's tier, or undefined when it has none. Stored nulls count as none. */
export function getDivisionTier(division: Pick<Division, 'tier'>): number | undefined {
  return typeof division.tier === 'number' && Number.isFinite(division.tier)
    ? division.tier
    : undefined;
}

/**
 * Position on the ladder: the tier for a tiered division, `Infinity` for a
 * developmental one, and undefined for an untiered main-roster division.
 */
export function getDivisionRank(division: Pick<Division, 'tier' | 'isDevelopmental'>): number | undefined {
  if (division.isDevelopmental === true) return Number.POSITIVE_INFINITY;
  return getDivisionTier(division);
}

/** True when the division takes part in promotion/relegation ordering. */
export function isRankedDivision(division: Pick<Division, 'tier' | 'isDevelopmental'>): boolean {
  return getDivisionRank(division) !== undefined;
}

/**
 * Sort order for lists: tiered divisions by tier, then untiered main-roster
 * divisions, then developmental ones. Ties break on name.
 */
export function compareDivisionsByTier(a: TierFields, b: TierFields): number {
  const bucketDiff = sortBucket(a) - sortBucket(b);
  if (bucketDiff !== 0) return bucketDiff;
  if (sortBucket(a) === 0) {
    const tierDiff = (getDivisionTier(a) ?? 0) - (getDivisionTier(b) ?? 0);
    if (tierDiff !== 0) return tierDiff;
  }
  return (a.name ?? '').localeCompare(b.name ?? '');
}

/** 0 = tiered, 1 = untiered main roster, 2 = developmental. */
function sortBucket(division: TierFields): number {
  if (division.isDevelopmental === true) return 2;
  return getDivisionTier(division) === undefined ? 1 : 0;
}

/** A sorted copy; the input is left untouched. */
export function sortDivisionsByTier<T extends TierFields>(divisions: readonly T[]): T[] {
  return [...divisions].sort(compareDivisionsByTier);
}

function neighbours<T extends TierFields>(
  divisions: readonly T[],
  divisionId: string,
  direction: 'above' | 'below',
): T[] {
  const current = divisions.find((division) => division.divisionId === divisionId);
  if (!current) return [];
  const currentRank = getDivisionRank(current);
  if (currentRank === undefined) return [];

  let targetRank: number | undefined;
  for (const division of divisions) {
    const rank = getDivisionRank(division);
    if (rank === undefined) continue;
    const isCandidate = direction === 'above' ? rank < currentRank : rank > currentRank;
    if (!isCandidate) continue;
    if (
      targetRank === undefined ||
      (direction === 'above' ? rank > targetRank : rank < targetRank)
    ) {
      targetRank = rank;
    }
  }
  if (targetRank === undefined) return [];

  return sortDivisionsByTier(
    divisions.filter((division) => getDivisionRank(division) === targetRank),
  );
}

/**
 * The divisions one rung above `divisionId` (all siblings at that tier).
 * Empty for the top tier, untiered divisions and unknown ids.
 */
export function getDivisionAbove<T extends TierFields>(divisions: readonly T[], divisionId: string): T[] {
  return neighbours(divisions, divisionId, 'above');
}

/**
 * The divisions one rung below `divisionId` (all siblings at that tier).
 * Below the lowest tier come the developmental divisions; below those, nothing.
 */
export function getDivisionBelow<T extends TierFields>(divisions: readonly T[], divisionId: string): T[] {
  return neighbours(divisions, divisionId, 'below');
}

/** Other divisions on the same rung as `divisionId`. */
export function getSiblingDivisions<T extends TierFields>(divisions: readonly T[], divisionId: string): T[] {
  const current = divisions.find((division) => division.divisionId === divisionId);
  if (!current) return [];
  const rank = getDivisionRank(current);
  if (rank === undefined) return [];
  return sortDivisionsByTier(
    divisions.filter(
      (division) => division.divisionId !== divisionId && getDivisionRank(division) === rank,
    ),
  );
}

/**
 * True when `candidateId` ranks strictly above `referenceId` (any number of
 * rungs). False when either is untiered or unknown. For DMV-02 track checks.
 */
export function isDivisionAbove(
  divisions: readonly TierFields[],
  candidateId: string,
  referenceId: string,
): boolean {
  const candidate = divisions.find((division) => division.divisionId === candidateId);
  const reference = divisions.find((division) => division.divisionId === referenceId);
  if (!candidate || !reference) return false;
  const candidateRank = getDivisionRank(candidate);
  const referenceRank = getDivisionRank(reference);
  if (candidateRank === undefined || referenceRank === undefined) return false;
  return candidateRank < referenceRank;
}

/** Validate a `tier` value from a request body. Null clears the tier. */
export function validateDivisionTier(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_DIVISION_TIER ||
    value > MAX_DIVISION_TIER
  ) {
    return `tier must be an integer from ${MIN_DIVISION_TIER} to ${MAX_DIVISION_TIER}, or null`;
  }
  return null;
}

// ─── Standings zones (DMV-07) ───────────────────────────────────────

/** Zone size used when a division has none stored. */
export const DEFAULT_ZONE_SIZE = 2;
export const MAX_ZONE_SIZE = 20;

/** Validate a promotion/relegation zone size from a request body. Null resets to the default. */
export function validateZoneSize(field: string, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_ZONE_SIZE) {
    return `${field} must be an integer from 0 to ${MAX_ZONE_SIZE}, or null`;
  }
  return null;
}
