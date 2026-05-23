/**
 * Rivalry heat policy (RIV-21).
 *
 * Pure, side-effect-free math that turns a list of rated matches into a
 * `heatScore` (number) and a `tier` (named bucket). Handlers in RIV-23 and
 * RIV-26 invoke this; tuning thresholds here changes the entire feature
 * without touching I/O code.
 *
 * Model:
 *   - Each rated match contributes `(ratingAverage - HEAT_PIVOT) * weight`.
 *   - `weight = min(ratingsCount, HEAT_MAX_WEIGHT)` so a single popular
 *     match can't run away with the score, and a single-rating match still
 *     moves the needle a little.
 *   - Matches with `ratingsCount === 0` are ignored (no signal).
 *   - The sum is clamped to ±HEAT_SCORE_CAP, then bucketed via
 *     HEAT_TIER_THRESHOLDS.
 *
 * Above-pivot ratings push the score positive (hot/scorching); below-pivot
 * ratings pull it negative (cold/frozen). A rivalry with no rated matches
 * sits at 0 → 'warm'.
 */

/** A single match's rating roll-up. */
export type RatedMatchInput = {
  /** Half-star average on a 0.5–5 scale. */
  ratingAverage: number;
  /** Number of users who rated this match. */
  ratingsCount: number;
  /**
   * When true, the GM has flagged this match as Match of the Night;
   * its contribution to rivalry heat is multiplied by
   * `MOTN_HEAT_MULTIPLIER` (above-pivot matches get a bigger nudge up,
   * below-pivot ones a bigger nudge down — a celebrated bad match
   * still hurts, just more honestly).
   */
  matchOfTheNight?: boolean;
};

/** The five visible heat tiers, coldest → hottest. */
export type HeatTier = 'frozen' | 'cold' | 'warm' | 'hot' | 'scorching';

/** What the policy returns. `ratedMatchCount` is informational. */
export type HeatResult = {
  heatScore: number;
  tier: HeatTier;
  ratedMatchCount: number;
};

/** Neutral rating — at this average a match contributes nothing. */
export const HEAT_PIVOT = 2.5;

/** Cap how much one match can dominate the score (in `ratingsCount`). */
export const HEAT_MAX_WEIGHT = 5;

/** Bounds for the resulting score; tiers sit inside this range. */
export const HEAT_SCORE_CAP = 100;

/**
 * Multiplier applied to a Match-of-the-Night's contribution. A 5★ MOTN
 * with full weight contributes `2.5 × 5 × 1.5 = 18.75` instead of
 * `12.5` — enough to push a rivalry tier without dominating the score.
 */
export const MOTN_HEAT_MULTIPLIER = 1.5;

/**
 * Inclusive lower bounds for each tier. Ordered hottest → coldest so the
 * first match wins. A score of exactly `min` belongs to that tier.
 *
 *   scorching:  +60 … +100
 *   hot:        +20 …  +59
 *   warm:       -19 …  +19
 *   cold:       -59 …  -20
 *   frozen:    -100 …  -60
 */
export const HEAT_TIER_THRESHOLDS: ReadonlyArray<{ min: number; tier: HeatTier }> = [
  { min: 60, tier: 'scorching' },
  { min: 20, tier: 'hot' },
  { min: -19, tier: 'warm' },
  { min: -59, tier: 'cold' },
  { min: -Infinity, tier: 'frozen' },
];

/** Centre-of-tier heatScore for an admin manual override. */
export const HEAT_TIER_CENTRES: Readonly<Record<HeatTier, number>> = {
  frozen: -80,
  cold: -40,
  warm: 0,
  hot: 40,
  scorching: 80,
};

const clamp = (value: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, value));

/**
 * Resolve a raw `heatScore` to its named tier. Pure.
 */
export function scoreToTier(score: number): HeatTier {
  for (const { min, tier } of HEAT_TIER_THRESHOLDS) {
    if (score >= min) return tier;
  }
  // Unreachable: the last threshold uses -Infinity as its lower bound.
  return 'frozen';
}

/**
 * Map a rivalry's rated matches to a heat score + tier.
 *
 * Pure: no I/O, no randomness, no time. Safe to call from anywhere.
 */
export function computeRivalryHeat(input: {
  matches: RatedMatchInput[];
}): HeatResult {
  let scoreSum = 0;
  let ratedMatchCount = 0;
  for (const m of input.matches) {
    if (!m || m.ratingsCount <= 0) continue;
    const weight = Math.min(m.ratingsCount, HEAT_MAX_WEIGHT);
    const motnMultiplier = m.matchOfTheNight ? MOTN_HEAT_MULTIPLIER : 1;
    scoreSum += (m.ratingAverage - HEAT_PIVOT) * weight * motnMultiplier;
    ratedMatchCount += 1;
  }
  const heatScore = clamp(scoreSum, -HEAT_SCORE_CAP, HEAT_SCORE_CAP);
  return {
    heatScore,
    tier: scoreToTier(heatScore),
    ratedMatchCount,
  };
}
