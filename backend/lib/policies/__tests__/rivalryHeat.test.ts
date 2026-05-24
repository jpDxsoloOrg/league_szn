import { describe, it, expect } from 'vitest';
import {
  HEAT_MAX_WEIGHT,
  HEAT_PIVOT,
  HEAT_SCORE_CAP,
  HEAT_TIER_CENTRES,
  MOTN_HEAT_MULTIPLIER,
  PROMO_HEAT_BASE,
  PROMO_REACTION_STEP,
  PROMO_BONUS_CAP,
  PROMO_MAX_REACTION_COUNT,
  computeRivalryHeat,
  scoreToTier,
  type RatedMatchInput,
  type PromoHeatInput,
} from '../rivalryHeat';

const match = (avg: number, count: number, motn = false): RatedMatchInput => ({
  ratingAverage: avg,
  ratingsCount: count,
  matchOfTheNight: motn,
});

const promo = (fire: number, trash: number): PromoHeatInput => ({
  fireCount: fire,
  trashCount: trash,
});

describe('computeRivalryHeat', () => {
  it('returns warm + 0 + 0 for an empty rivalry', () => {
    const result = computeRivalryHeat({ matches: [] });
    expect(result.heatScore).toBe(0);
    expect(result.tier).toBe('warm');
    expect(result.ratedMatchCount).toBe(0);
    expect(result.promoCount).toBe(0);
  });

  it('rates a single 5★ match with 1 rating at +2.5 → warm', () => {
    const result = computeRivalryHeat({ matches: [match(5, 1)] });
    expect(result.heatScore).toBeCloseTo(2.5);
    expect(result.tier).toBe('warm');
    expect(result.ratedMatchCount).toBe(1);
  });

  it('rates a single 5★ match with 5 ratings at +12.5 → warm', () => {
    const result = computeRivalryHeat({ matches: [match(5, 5)] });
    expect(result.heatScore).toBeCloseTo(12.5);
    expect(result.tier).toBe('warm');
  });

  it('caps a single match weight at HEAT_MAX_WEIGHT', () => {
    const capped = computeRivalryHeat({ matches: [match(5, 50)] });
    const atCap = computeRivalryHeat({ matches: [match(5, HEAT_MAX_WEIGHT)] });
    expect(capped.heatScore).toBe(atCap.heatScore);
    expect(capped.heatScore).toBeCloseTo(12.5);
    expect(capped.tier).toBe('warm');
  });

  it('reaches hot at +37.5 with three 5★ matches × 5 ratings', () => {
    const result = computeRivalryHeat({
      matches: [match(5, 5), match(5, 5), match(5, 5)],
    });
    expect(result.heatScore).toBeCloseTo(37.5);
    expect(result.tier).toBe('hot');
    expect(result.ratedMatchCount).toBe(3);
  });

  it('reaches scorching at +62.5 with five 5★ matches × 5 ratings', () => {
    const result = computeRivalryHeat({
      matches: Array.from({ length: 5 }, () => match(5, 5)),
    });
    expect(result.heatScore).toBeCloseTo(62.5);
    expect(result.tier).toBe('scorching');
  });

  it('drops below pivot for one 0.5★ match × 5 ratings → −10 → warm', () => {
    const result = computeRivalryHeat({ matches: [match(0.5, 5)] });
    expect(result.heatScore).toBeCloseTo(-10);
    expect(result.tier).toBe('warm');
  });

  it('hits frozen once the cumulative negative drops to ≤ −60', () => {
    // Six 0.5★ matches × 5 ratings each → −60 → frozen
    const result = computeRivalryHeat({
      matches: Array.from({ length: 6 }, () => match(0.5, 5)),
    });
    expect(result.heatScore).toBeCloseTo(-60);
    expect(result.tier).toBe('frozen');
  });

  it('clamps positive scores at +HEAT_SCORE_CAP', () => {
    // 20 matches × 5★ × 5 ratings = 20 * 12.5 = 250 → clamped to +100
    const result = computeRivalryHeat({
      matches: Array.from({ length: 20 }, () => match(5, 5)),
    });
    expect(result.heatScore).toBe(HEAT_SCORE_CAP);
    expect(result.tier).toBe('scorching');
  });

  it('clamps negative scores at −HEAT_SCORE_CAP', () => {
    // 20 matches × 0.5★ × 5 ratings = 20 * −10 = −200 → clamped to −100
    const result = computeRivalryHeat({
      matches: Array.from({ length: 20 }, () => match(0.5, 5)),
    });
    expect(result.heatScore).toBe(-HEAT_SCORE_CAP);
    expect(result.tier).toBe('frozen');
  });

  it('ignores matches with ratingsCount === 0', () => {
    const result = computeRivalryHeat({
      matches: [match(5, 0), match(0.5, 0), match(2.5, 0)],
    });
    expect(result.heatScore).toBe(0);
    expect(result.tier).toBe('warm');
    expect(result.ratedMatchCount).toBe(0);
  });

  it('treats negative ratingsCount as zero (defensive)', () => {
    const result = computeRivalryHeat({ matches: [match(5, -3)] });
    expect(result.heatScore).toBe(0);
    expect(result.ratedMatchCount).toBe(0);
  });

  it('regression: lowering an average strictly lowers the score', () => {
    const before = computeRivalryHeat({ matches: [match(4, 3), match(3, 4)] });
    const after = computeRivalryHeat({ matches: [match(3, 3), match(3, 4)] });
    expect(after.heatScore).toBeLessThan(before.heatScore);
  });

  it('pivot anchor: a 2.5★ avg contributes nothing regardless of weight', () => {
    const result = computeRivalryHeat({
      matches: [match(HEAT_PIVOT, 5), match(HEAT_PIVOT, 1), match(HEAT_PIVOT, 100)],
    });
    expect(result.heatScore).toBe(0);
    expect(result.tier).toBe('warm');
    // …but they're still counted as rated matches.
    expect(result.ratedMatchCount).toBe(3);
  });
});

describe('scoreToTier boundaries', () => {
  it('+60 → scorching', () => {
    expect(scoreToTier(60)).toBe('scorching');
  });

  it('+59 → hot', () => {
    expect(scoreToTier(59)).toBe('hot');
  });

  it('+20 → hot', () => {
    expect(scoreToTier(20)).toBe('hot');
  });

  it('+19 → warm', () => {
    expect(scoreToTier(19)).toBe('warm');
  });

  it('0 → warm', () => {
    expect(scoreToTier(0)).toBe('warm');
  });

  it('−19 → warm', () => {
    expect(scoreToTier(-19)).toBe('warm');
  });

  it('−20 → cold', () => {
    expect(scoreToTier(-20)).toBe('cold');
  });

  it('−59 → cold', () => {
    expect(scoreToTier(-59)).toBe('cold');
  });

  it('−60 → frozen', () => {
    expect(scoreToTier(-60)).toBe('frozen');
  });

  it('extreme negatives stay frozen', () => {
    expect(scoreToTier(-9999)).toBe('frozen');
  });

  it('extreme positives stay scorching', () => {
    expect(scoreToTier(9999)).toBe('scorching');
  });
});

describe('HEAT_TIER_CENTRES', () => {
  it('every tier centre resolves back to its own tier', () => {
    for (const tier of ['frozen', 'cold', 'warm', 'hot', 'scorching'] as const) {
      expect(scoreToTier(HEAT_TIER_CENTRES[tier])).toBe(tier);
    }
  });

  describe('Match of the Night boost', () => {
    it('multiplies a MOTN match contribution by MOTN_HEAT_MULTIPLIER', () => {
      // Same shape both ways — only the MOTN flag differs.
      const baseline = computeRivalryHeat({ matches: [match(5, 5, false)] });
      const boosted = computeRivalryHeat({ matches: [match(5, 5, true)] });

      const expectedBaseline = (5 - HEAT_PIVOT) * HEAT_MAX_WEIGHT;
      const expectedBoosted = expectedBaseline * MOTN_HEAT_MULTIPLIER;

      expect(baseline.heatScore).toBeCloseTo(expectedBaseline);
      expect(boosted.heatScore).toBeCloseTo(expectedBoosted);
      expect(boosted.heatScore).toBeGreaterThan(baseline.heatScore);
    });

    it('amplifies the loss when a MOTN match is below the pivot', () => {
      // A celebrated bad match should hurt MORE than a regular bad match
      // — the multiplier doesn't change sign, it scales magnitude.
      const baseline = computeRivalryHeat({ matches: [match(1, 5, false)] });
      const boosted = computeRivalryHeat({ matches: [match(1, 5, true)] });

      expect(baseline.heatScore).toBeLessThan(0);
      expect(boosted.heatScore).toBeLessThan(baseline.heatScore);
    });

    it('does not affect matches where MOTN is undefined', () => {
      const result = computeRivalryHeat({
        matches: [{ ratingAverage: 5, ratingsCount: 5 }],
      });
      const expected = (5 - HEAT_PIVOT) * HEAT_MAX_WEIGHT;
      expect(result.heatScore).toBeCloseTo(expected);
    });

    it('a single 5★ MOTN with 5 votes lands in `hot`', () => {
      // Plain version sits at +12.5 → warm. With MOTN: +18.75 → still warm.
      // Three such matches: 56.25 → hot.
      const result = computeRivalryHeat({
        matches: [match(5, 5, true), match(5, 5, true), match(5, 5, true)],
      });
      expect(result.heatScore).toBeCloseTo((5 - HEAT_PIVOT) * 5 * MOTN_HEAT_MULTIPLIER * 3);
      expect(result.tier).toBe('hot');
    });

    it('MOTN can only push at most HEAT_SCORE_CAP', () => {
      // Twenty 5★ MOTN matches would mathematically blow well past the cap.
      const motnMatches = Array.from({ length: 20 }, () => match(5, 50, true));
      const result = computeRivalryHeat({ matches: motnMatches });
      expect(result.heatScore).toBe(HEAT_SCORE_CAP);
      expect(result.tier).toBe('scorching');
    });
  });
});

describe('promo heat contribution', () => {
  it('a single promo with zero reactions adds exactly PROMO_HEAT_BASE', () => {
    const result = computeRivalryHeat({ matches: [], promos: [promo(0, 0)] });
    expect(result.heatScore).toBeCloseTo(PROMO_HEAT_BASE);
    expect(result.promoCount).toBe(1);
    expect(result.ratedMatchCount).toBe(0);
  });

  it('fire reactions add PROMO_REACTION_STEP each, up to PROMO_BONUS_CAP', () => {
    const result = computeRivalryHeat({
      matches: [],
      promos: [promo(PROMO_MAX_REACTION_COUNT, 0)],
    });
    // base + min(5 * step, cap)
    const expectedBonus = Math.min(PROMO_MAX_REACTION_COUNT * PROMO_REACTION_STEP, PROMO_BONUS_CAP);
    expect(result.heatScore).toBeCloseTo(PROMO_HEAT_BASE + expectedBonus);
  });

  it('trash reactions subtract PROMO_REACTION_STEP each', () => {
    const result = computeRivalryHeat({
      matches: [],
      promos: [promo(0, 2)],
    });
    expect(result.heatScore).toBeCloseTo(PROMO_HEAT_BASE - 2 * PROMO_REACTION_STEP);
  });

  it('reactions beyond PROMO_MAX_REACTION_COUNT do not move the bonus', () => {
    const capped = computeRivalryHeat({
      matches: [],
      promos: [promo(PROMO_MAX_REACTION_COUNT + 100, 0)],
    });
    const atCap = computeRivalryHeat({
      matches: [],
      promos: [promo(PROMO_MAX_REACTION_COUNT, 0)],
    });
    expect(capped.heatScore).toBeCloseTo(atCap.heatScore);
  });

  it('fire and trash cancel each other before the cap', () => {
    const result = computeRivalryHeat({
      matches: [],
      promos: [promo(3, 3)],
    });
    expect(result.heatScore).toBeCloseTo(PROMO_HEAT_BASE);
  });

  it('the reaction bonus is clamped per promo to ±PROMO_BONUS_CAP', () => {
    // Wide-but-imbalanced reactions: only the first PROMO_MAX_REACTION_COUNT count.
    const result = computeRivalryHeat({
      matches: [],
      promos: [promo(PROMO_MAX_REACTION_COUNT, 0)],
    });
    expect(result.heatScore).toBeLessThanOrEqual(PROMO_HEAT_BASE + PROMO_BONUS_CAP);
  });

  it('multiple promos add their contributions together', () => {
    const single = computeRivalryHeat({ matches: [], promos: [promo(2, 0)] });
    const triple = computeRivalryHeat({
      matches: [],
      promos: [promo(2, 0), promo(2, 0), promo(2, 0)],
    });
    expect(triple.heatScore).toBeCloseTo(single.heatScore * 3);
    expect(triple.promoCount).toBe(3);
  });

  it('promos stack with match contributions', () => {
    const matchesOnly = computeRivalryHeat({ matches: [match(5, 5)] });
    const both = computeRivalryHeat({ matches: [match(5, 5)], promos: [promo(0, 0)] });
    expect(both.heatScore).toBeCloseTo(matchesOnly.heatScore + PROMO_HEAT_BASE);
    expect(both.ratedMatchCount).toBe(1);
    expect(both.promoCount).toBe(1);
  });

  it('promoCount is 0 when no promos are passed (back-compat)', () => {
    const result = computeRivalryHeat({ matches: [match(5, 5)] });
    expect(result.promoCount).toBe(0);
  });

  it('negative reaction counts are treated as zero (defensive)', () => {
    const result = computeRivalryHeat({
      matches: [],
      promos: [{ fireCount: -5, trashCount: -5 }],
    });
    expect(result.heatScore).toBeCloseTo(PROMO_HEAT_BASE);
  });
});

describe('HeatTunables overrides', () => {
  it('a smaller promoBase reduces a no-reaction promo proportionally', () => {
    const result = computeRivalryHeat(
      { matches: [], promos: [promo(0, 0)] },
      { promoBase: 1 },
    );
    expect(result.heatScore).toBeCloseTo(1);
  });

  it('a larger promoBonusCap lets the bonus exceed the default ceiling', () => {
    const overrideCap = PROMO_BONUS_CAP * 3;
    const result = computeRivalryHeat(
      { matches: [], promos: [promo(PROMO_MAX_REACTION_COUNT, 0)] },
      { promoBonusCap: overrideCap, promoReactionStep: 5 },
    );
    // 5 fire × step(5) = 25, clamped to overrideCap(21) -> heat = base + 21
    expect(result.heatScore).toBeCloseTo(PROMO_HEAT_BASE + Math.min(25, overrideCap));
  });

  it('overriding pivot shifts the zero-contribution match rating', () => {
    const baseline = computeRivalryHeat({ matches: [match(3, 5)] });
    const shifted = computeRivalryHeat({ matches: [match(3, 5)] }, { pivot: 3 });
    expect(baseline.heatScore).not.toBe(0);
    expect(shifted.heatScore).toBe(0);
  });

  it('overriding maxWeight changes how much a single match dominates', () => {
    const tight = computeRivalryHeat({ matches: [match(5, 50)] }, { maxWeight: 1 });
    expect(tight.heatScore).toBeCloseTo(5 - HEAT_PIVOT);
  });

  it('overriding scoreCap clamps the final score to the new bound', () => {
    const matches = Array.from({ length: 20 }, () => match(5, 5));
    const result = computeRivalryHeat({ matches }, { scoreCap: 30 });
    expect(result.heatScore).toBe(30);
  });

  it('overriding tierThresholds reclassifies the same heat score', () => {
    const result = computeRivalryHeat(
      { matches: [], promos: [promo(0, 0)] },
      {
        tierThresholds: [
          { min: 1, tier: 'scorching' },
          { min: 0, tier: 'hot' },
          { min: -1, tier: 'warm' },
          { min: -2, tier: 'cold' },
          { min: -Infinity, tier: 'frozen' },
        ],
      },
    );
    expect(result.tier).toBe('scorching');
  });
});
