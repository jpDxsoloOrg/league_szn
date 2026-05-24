/**
 * Rivalry heat policy (RIV-21, extended for promo bonus).
 *
 * Pure, side-effect-free math that turns rated matches + promos into a
 * `heatScore` (number) and a `tier` (named bucket). Handlers invoke this;
 * tuning thresholds here changes the entire feature without touching I/O code.
 *
 * Match contribution:
 *   - Each rated match contributes `(ratingAverage - HEAT_PIVOT) * weight`.
 *   - `weight = min(ratingsCount, HEAT_MAX_WEIGHT)` so a single popular
 *     match can't run away with the score, and a single-rating match still
 *     moves the needle a little.
 *   - Matches with `ratingsCount === 0` are ignored (no signal).
 *
 * Promo contribution (call-out + rivalry promo types):
 *   - Each contributing promo adds `PROMO_HEAT_BASE` plus a reaction
 *     bonus of `(fire5 − trash5) * PROMO_REACTION_STEP`, where fireN/trashN
 *     are the first PROMO_MAX_REACTION_COUNT reactions of each type (mirrors
 *     the HEAT_MAX_WEIGHT cap for matches — viral promos don't run away).
 *   - The reaction bonus is clamped to ±PROMO_BONUS_CAP per promo.
 *
 * The summed score is clamped to ±HEAT_SCORE_CAP, then bucketed via
 * HEAT_TIER_THRESHOLDS. Above-pivot ratings + fire-heavy promos push the
 * score positive (hot/scorching); below-pivot ratings + trash-heavy promos
 * pull it negative (cold/frozen). A rivalry with no signal sits at 0 → 'warm'.
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

/**
 * A single contributing promo (call-out or rivalry type, tied to a
 * specific rivalry via `rivalryId`). Only `fire` and `trash` counts
 * factor in — other reactions are flavor.
 */
export type PromoHeatInput = {
  /** Count of `fire` reactions (clamped at PROMO_MAX_REACTION_COUNT). */
  fireCount: number;
  /** Count of `trash` reactions (clamped at PROMO_MAX_REACTION_COUNT). */
  trashCount: number;
};

/** The five visible heat tiers, coldest → hottest. */
export type HeatTier = 'frozen' | 'cold' | 'warm' | 'hot' | 'scorching';

/** What the policy returns. `ratedMatchCount` / `promoCount` are informational. */
export type HeatResult = {
  heatScore: number;
  tier: HeatTier;
  ratedMatchCount: number;
  promoCount: number;
};

/**
 * Runtime overrides for the tunables below. Any field left undefined
 * falls back to the exported file-level constant. Admin endpoints feed
 * a `HeatTunables` object through `computeRivalryHeat`'s second arg.
 */
export type HeatTunables = Partial<{
  pivot: number;
  maxWeight: number;
  scoreCap: number;
  motnMultiplier: number;
  promoBase: number;
  promoReactionStep: number;
  promoBonusCap: number;
  promoMaxReactionCount: number;
  tierThresholds: ReadonlyArray<{ min: number; tier: HeatTier }>;
}>;

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
 * Base heat added per contributing promo (call-out or rivalry type with
 * a `rivalryId`). A no-reaction promo nudges heat by exactly this much.
 */
export const PROMO_HEAT_BASE = 3;

/** Heat added per `fire` reaction (and removed per `trash`), up to the cap. */
export const PROMO_REACTION_STEP = 1.4;

/**
 * Max magnitude of the reaction bonus per promo. Caps a viral promo so
 * it can't dwarf a great match — at the defaults this is ±7, so a promo
 * tops out at `3 + 7 = 10` heat (about as much as a 5★ match × 4 votes).
 */
export const PROMO_BONUS_CAP = 7;

/**
 * Cap on how many reactions of each type count toward the bonus.
 * Mirrors HEAT_MAX_WEIGHT for matches — past the cap, more reactions
 * don't move the needle further.
 */
export const PROMO_MAX_REACTION_COUNT = 5;

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
 * Resolve a raw `heatScore` to its named tier. Pure. When custom
 * `thresholds` are passed they must be ordered hottest → coldest with
 * `-Infinity` as the final lower bound (same shape as HEAT_TIER_THRESHOLDS).
 */
export function scoreToTier(
  score: number,
  thresholds: ReadonlyArray<{ min: number; tier: HeatTier }> = HEAT_TIER_THRESHOLDS,
): HeatTier {
  for (const { min, tier } of thresholds) {
    if (score >= min) return tier;
  }
  // Unreachable when the threshold list ends at -Infinity.
  return 'frozen';
}

/**
 * Map a rivalry's rated matches + promos to a heat score + tier.
 *
 * Pure: no I/O, no randomness, no time. Safe to call from anywhere.
 * Pass `tunables` to override the file-level constants (used by the
 * admin config screen so the live formula can be tweaked without a deploy).
 */
export function computeRivalryHeat(
  input: {
    matches: RatedMatchInput[];
    promos?: PromoHeatInput[];
  },
  tunables: HeatTunables = {},
): HeatResult {
  const pivot = tunables.pivot ?? HEAT_PIVOT;
  const maxWeight = tunables.maxWeight ?? HEAT_MAX_WEIGHT;
  const scoreCap = tunables.scoreCap ?? HEAT_SCORE_CAP;
  const motnMultiplier = tunables.motnMultiplier ?? MOTN_HEAT_MULTIPLIER;
  const promoBase = tunables.promoBase ?? PROMO_HEAT_BASE;
  const promoReactionStep = tunables.promoReactionStep ?? PROMO_REACTION_STEP;
  const promoBonusCap = tunables.promoBonusCap ?? PROMO_BONUS_CAP;
  const promoMaxReactionCount = tunables.promoMaxReactionCount ?? PROMO_MAX_REACTION_COUNT;
  const tierThresholds = tunables.tierThresholds ?? HEAT_TIER_THRESHOLDS;

  let scoreSum = 0;
  let ratedMatchCount = 0;
  for (const m of input.matches) {
    if (!m || m.ratingsCount <= 0) continue;
    const weight = Math.min(m.ratingsCount, maxWeight);
    const motnFactor = m.matchOfTheNight ? motnMultiplier : 1;
    scoreSum += (m.ratingAverage - pivot) * weight * motnFactor;
    ratedMatchCount += 1;
  }

  let promoCount = 0;
  for (const p of input.promos ?? []) {
    if (!p) continue;
    const fire = Math.min(Math.max(0, p.fireCount), promoMaxReactionCount);
    const trash = Math.min(Math.max(0, p.trashCount), promoMaxReactionCount);
    const rawBonus = (fire - trash) * promoReactionStep;
    const bonus = clamp(rawBonus, -promoBonusCap, promoBonusCap);
    scoreSum += promoBase + bonus;
    promoCount += 1;
  }

  const heatScore = clamp(scoreSum, -scoreCap, scoreCap);
  return {
    heatScore,
    tier: scoreToTier(heatScore, tierThresholds),
    ratedMatchCount,
    promoCount,
  };
}
