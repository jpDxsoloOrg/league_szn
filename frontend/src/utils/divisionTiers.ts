import type { Division } from '../types';

/** Mirrors backend/lib/divisionTiers.ts: 1 = top tier, developmental divisions last. */
export const MIN_DIVISION_TIER = 1;
export const MAX_DIVISION_TIER = 99;

type TierFields = Pick<Division, 'tier' | 'isDevelopmental' | 'name'>;

export function getDivisionTier(division: Pick<Division, 'tier'>): number | undefined {
  return typeof division.tier === 'number' && Number.isFinite(division.tier) ? division.tier : undefined;
}

function bucket(division: TierFields): number {
  if (division.isDevelopmental === true) return 2;
  return getDivisionTier(division) === undefined ? 1 : 0;
}

/** Tiered divisions by tier, then untiered, then developmental; ties by name. */
export function compareDivisionsByTier(a: TierFields, b: TierFields): number {
  const bucketDiff = bucket(a) - bucket(b);
  if (bucketDiff !== 0) return bucketDiff;
  if (bucket(a) === 0) {
    const tierDiff = (getDivisionTier(a) ?? 0) - (getDivisionTier(b) ?? 0);
    if (tierDiff !== 0) return tierDiff;
  }
  return (a.name ?? '').localeCompare(b.name ?? '');
}

export function sortDivisionsByTier<T extends TierFields>(divisions: readonly T[]): T[] {
  return [...divisions].sort(compareDivisionsByTier);
}

/** Numeric sort key for tables: tier, then untiered, then developmental. */
export function divisionTierSortValue(division: TierFields): number {
  if (division.isDevelopmental === true) return MAX_DIVISION_TIER + 2;
  return getDivisionTier(division) ?? MAX_DIVISION_TIER + 1;
}

/**
 * Ladder position: the tier, `Infinity` for developmental divisions, and
 * undefined for an untiered main-roster division (outside the ladder).
 */
export function getDivisionRank(division: Pick<Division, 'tier' | 'isDevelopmental'>): number | undefined {
  if (division.isDevelopmental === true) return Number.POSITIVE_INFINITY;
  return getDivisionTier(division);
}

/**
 * The divisions one rung above or below `divisionId` (all siblings at that
 * rung). Mirrors getDivisionAbove / getDivisionBelow in the backend.
 */
export function getAdjacentDivisions<T extends Pick<Division, 'divisionId' | 'tier' | 'isDevelopmental' | 'name'>>(
  divisions: readonly T[],
  divisionId: string,
  direction: 'above' | 'below',
): T[] {
  const current = divisions.find((division) => division.divisionId === divisionId);
  const currentRank = current ? getDivisionRank(current) : undefined;
  if (currentRank === undefined) return [];
  const ranks = divisions
    .map(getDivisionRank)
    .filter((rank): rank is number => rank !== undefined && (direction === 'above' ? rank < currentRank : rank > currentRank));
  if (ranks.length === 0) return [];
  const targetRank = direction === 'above' ? Math.max(...ranks) : Math.min(...ranks);
  return sortDivisionsByTier(divisions.filter((division) => getDivisionRank(division) === targetRank));
}

// ─── Standings zones (DMV-07) ───────────────────────────────────────

/** Mirrors backend/lib/divisionTiers.ts: a division with no stored size uses 2. */
export const DEFAULT_ZONE_SIZE = 2;
export const MAX_ZONE_SIZE = 20;

export type StandingsZone = 'promotion' | 'relegation';

export interface StandingsZoneSizes {
  promotion: number;
  relegation: number;
}

/** A stored zone size, or the default when none is stored. */
export function getZoneSize(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : DEFAULT_ZONE_SIZE;
}

/**
 * Zone sizes for one division's table. The top tier has no promotion zone and
 * a division with nothing below it has no relegation zone. Untiered divisions
 * are off the ladder and get neither. `showRelegation` is false for viewers
 * who may not see the relegation zone.
 */
export function getStandingsZoneSizes(
  divisions: readonly Division[],
  divisionId: string,
  showRelegation: boolean,
): StandingsZoneSizes {
  const division = divisions.find((candidate) => candidate.divisionId === divisionId);
  if (!division) return { promotion: 0, relegation: 0 };
  const hasAbove = getAdjacentDivisions(divisions, divisionId, 'above').length > 0;
  const hasBelow = getAdjacentDivisions(divisions, divisionId, 'below').length > 0;
  return {
    promotion: hasAbove ? getZoneSize(division.promotionZoneSize) : 0,
    relegation: showRelegation && hasBelow ? getZoneSize(division.relegationZoneSize) : 0,
  };
}

/**
 * The zone for a 1-based table position among `tableSize` ranked players.
 * Promotion wins when a short table makes the zones overlap.
 */
export function getStandingsZone(rank: number, tableSize: number, sizes: StandingsZoneSizes): StandingsZone | undefined {
  if (rank < 1 || rank > tableSize) return undefined;
  if (rank <= sizes.promotion) return 'promotion';
  if (rank > tableSize - sizes.relegation) return 'relegation';
  return undefined;
}
