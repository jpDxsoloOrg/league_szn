import { describe, it, expect } from 'vitest';
import type { WrestlerBuild } from '../../repositories/types';
import {
  ALL_ROUNDER_SPECIALTY_BONUS,
  RULES_VERSION,
  SPECIALTY_BONUS,
  STAT_BASE,
  TIER_BUDGETS,
  type CoreStat,
  type SimCategory,
  type StyleId,
} from '../buildRules';
import { defaultBuild, effectiveBuild } from '../wrestlerBuild';
import {
  MIN_WIN_CHANCE,
  STAT_WEIGHTS_BY_CATEGORY,
  competitorFromBuild,
  competitorRating,
  createRng,
  deriveSeed,
  moveScore,
  netStyleEdge,
  normalizeSeed,
  probabilitiesFromRatings,
  sideRating,
  simulate,
  winProbabilities,
  type SimCompetitor,
  type SimSide,
} from '../matchSim';

const TIER_ONE_BUDGET = TIER_BUDGETS[1];

function stats(values: Partial<Record<CoreStat, number>> = {}): Record<CoreStat, number> {
  return { strikes: STAT_BASE, grapple: STAT_BASE, agility: STAT_BASE, endurance: STAT_BASE, ...values };
}

function competitor(playerId: string, overrides: Partial<SimCompetitor> = {}): SimCompetitor {
  return {
    playerId,
    style: 'allRounder',
    effectiveStats: stats({ strikes: 60, grapple: 60, agility: 60, endurance: 60 }),
    signatureLevels: [1],
    finisherLevels: [1],
    form: 50,
    ...overrides,
  };
}

function side(sideId: string, ...members: SimCompetitor[]): SimSide {
  return { sideId, members };
}

function fromBuild(playerId: string, build: WrestlerBuild, finisherLevel = 1): SimCompetitor {
  const effective = effectiveBuild(build, { signatures: [{}], finishers: [{ level: finisherLevel }] }, TIER_ONE_BUDGET);
  return competitorFromBuild(playerId, effective);
}

/** Spends the full tier-1 budget: 75 in every stat (140) + finisher level 3 (16) = 156. */
function maxedTierOne(playerId: string, style: StyleId = 'powerhouse', specialty?: SimCategory): SimCompetitor {
  const build: WrestlerBuild = {
    style,
    stats: stats({ strikes: 75, grapple: 75, agility: 75, endurance: 75 }),
    updatedAt: '',
  };
  if (specialty) build.specialty = specialty;
  return fromBuild(playerId, build, 3);
}

function baseBuild(playerId: string, style: StyleId = 'allRounder'): SimCompetitor {
  return fromBuild(playerId, { ...defaultBuild(), style });
}

function winShare(sides: SimSide[], category: SimCategory, sideId: string, runs: number): number {
  let wins = 0;
  for (let seed = 0; seed < runs; seed += 1) {
    if (simulate(sides, { category, seed }).winnerSideId === sideId) wins += 1;
  }
  return wins / runs;
}

function chanceOf(sides: SimSide[], category: SimCategory, sideId: string): number {
  const entry = winProbabilities(sides, category).find((item) => item.sideId === sideId);
  if (!entry) throw new Error(`no side ${sideId}`);
  return entry.probability;
}

describe('tunables', () => {
  it('every category weight set sums to 1', () => {
    for (const weights of Object.values(STAT_WEIGHTS_BY_CATEGORY)) {
      const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
      expect(total).toBeCloseTo(1, 10);
    }
  });
});

describe('seeded PRNG', () => {
  it('repeats for the same seed and differs across seeds', () => {
    const first = createRng(42);
    const second = createRng(42);
    const values = Array.from({ length: 5 }, () => first());
    expect(Array.from({ length: 5 }, () => second())).toEqual(values);
    expect(createRng(43)()).not.toBe(values[0]);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('normalizes seeds to unsigned 32-bit integers', () => {
    expect(normalizeSeed(-1)).toBe(4294967295);
    expect(normalizeSeed(7.9)).toBe(7);
    expect(normalizeSeed(Number.NaN)).toBe(0);
  });

  it('derives separate streams from the same seed', () => {
    expect(deriveSeed(42, 1)).not.toBe(42);
    expect(deriveSeed(42, 1)).toBe(deriveSeed(42, 1));
    expect(deriveSeed(42, 0)).toBe(42);
  });
});

describe('competitorRating', () => {
  it('scores moves from 0 (all level 1) to 100 (all level 5)', () => {
    expect(moveScore([1], [1])).toBe(0);
    expect(moveScore([5, 5], [5])).toBe(100);
    expect(moveScore([], [])).toBe(0);
    expect(moveScore([1], [5, 1])).toBeCloseTo(60);
  });

  it('rises with form and move levels', () => {
    const base = competitorRating(competitor('a'), 'standard');
    expect(competitorRating(competitor('a', { form: 80 }), 'standard')).toBeGreaterThan(base);
    expect(competitorRating(competitor('a', { finisherLevels: [4] }), 'standard')).toBeGreaterThan(base);
  });

  it('applies optional modifiers multiplicatively (INJ-09 / ECO-10 hook)', () => {
    const base = competitorRating(competitor('a'), 'standard');
    const modified = competitorRating(
      competitor('a', { modifiers: [{ source: 'stamina', multiplier: 0.8 }, { source: 'simBoost', multiplier: 1.1 }] }),
      'standard',
    );
    expect(modified).toBeCloseTo(base * 0.8 * 1.1, 10);
  });
});

describe('winProbabilities', () => {
  it('gives identical sides 50/50', () => {
    const [first, second] = winProbabilities([side('a', competitor('a')), side('b', competitor('b'))], 'standard');
    expect(first.probability).toBeCloseTo(0.5, 3);
    expect(second.probability).toBeCloseTo(0.5, 3);
  });

  it('sums to 1 and floors every side at MIN_WIN_CHANCE', () => {
    const chances = probabilitiesFromRatings([200, 40, 40, 40]);
    expect(chances.reduce((sum, chance) => sum + chance, 0)).toBeCloseTo(1, 10);
    for (const chance of chances) expect(chance).toBeGreaterThanOrEqual(MIN_WIN_CHANCE - 1e-12);
  });

  it('gives every side of a 4-way at least MIN_WIN_CHANCE', () => {
    const sides = [
      side('a', maxedTierOne('a')),
      side('b', baseBuild('b')),
      side('c', baseBuild('c')),
      side('d', baseBuild('d')),
    ];
    const chances = winProbabilities(sides, 'standard');
    expect(chances.reduce((sum, entry) => sum + entry.probability, 0)).toBeCloseTo(1, 10);
    for (const entry of chances) expect(entry.probability).toBeGreaterThanOrEqual(MIN_WIN_CHANCE - 1e-12);
    expect(chances[0].probability).toBeGreaterThan(chances[1].probability);
  });

  it('rejects fewer than two sides, empty sides and duplicate ids', () => {
    expect(() => winProbabilities([side('a', competitor('a'))], 'standard')).toThrow(RangeError);
    expect(() => winProbabilities([side('a', competitor('a')), side('b')], 'standard')).toThrow(RangeError);
    expect(() =>
      winProbabilities([side('a', competitor('a')), side('a', competitor('b'))], 'standard'),
    ).toThrow(RangeError);
  });
});

describe('simulate', () => {
  const sides = [side('a', competitor('a')), side('b', competitor('b'))];

  it('is deterministic for the same seed', () => {
    const first = simulate(sides, { category: 'standard', seed: 1234 });
    const second = simulate(sides, { category: 'standard', seed: 1234 });
    expect(second).toEqual(first);
    expect(first.rulesVersion).toBe(RULES_VERSION);
    expect(first.seed).toBe(1234);
    expect(first.inputsDigest).toMatch(/^[0-9a-f]{16}$/);
  });

  it('varies the winner across 1000 seeds', () => {
    const winners = new Set<string>();
    for (let seed = 0; seed < 1000; seed += 1) {
      winners.add(simulate(sides, { category: 'standard', seed }).winnerSideId);
    }
    expect(winners).toEqual(new Set(['a', 'b']));
  });

  it('changes the digest when an input changes', () => {
    const digest = simulate(sides, { category: 'standard', seed: 1 }).inputsDigest;
    expect(simulate(sides, { category: 'cage', seed: 1 }).inputsDigest).not.toBe(digest);
    const changed = [side('a', competitor('a', { form: 51 })), side('b', competitor('b'))];
    expect(simulate(changed, { category: 'standard', seed: 1 }).inputsDigest).not.toBe(digest);
    expect(simulate(sides, { category: 'standard', seed: 99 }).inputsDigest).toBe(digest);
  });

  it('only ever names one of the sides as the winner (no draws in v1)', () => {
    const fourWay = [side('a', competitor('a')), side('b', competitor('b')), side('c', competitor('c')), side('d', competitor('d'))];
    for (let seed = 0; seed < 200; seed += 1) {
      expect(['a', 'b', 'c', 'd']).toContain(simulate(fourWay, { category: 'standard', seed }).winnerSideId);
    }
  });
});

describe('calibration', () => {
  it('a maxed tier-1 build beats a base build 80–92% of the time, never 100%', () => {
    const sides = [side('maxed', maxedTierOne('maxed')), side('base', baseBuild('base'))];
    const share = winShare(sides, 'standard', 'maxed', 10_000);
    expect(share).toBeGreaterThanOrEqual(0.8);
    expect(share).toBeLessThanOrEqual(0.92);
  });

  it('stays inside the band with specialty and style edge both favouring the maxed build', () => {
    // powerhouse beats highFlyer; cage is a powerhouse specialty.
    const sides = [side('maxed', maxedTierOne('maxed', 'powerhouse', 'cage')), side('base', baseBuild('base', 'highFlyer'))];
    const share = winShare(sides, 'cage', 'maxed', 10_000);
    expect(share).toBeGreaterThanOrEqual(0.8);
    expect(share).toBeLessThanOrEqual(0.92);
  });
});

describe('style edge', () => {
  it('moves an even matchup to about 55/45', () => {
    const midBuilds = [
      side('power', competitor('power', { style: 'powerhouse' })),
      side('flyer', competitor('flyer', { style: 'highFlyer' })),
    ];
    const baseBuilds = [side('power', baseBuild('power', 'powerhouse')), side('flyer', baseBuild('flyer', 'highFlyer'))];
    for (const sides of [midBuilds, baseBuilds]) {
      const chance = chanceOf(sides, 'standard', 'power');
      expect(chance).toBeGreaterThan(0.54);
      expect(chance).toBeLessThan(0.58);
    }
  });

  it('keeps allRounder vs anything even', () => {
    for (const style of ['powerhouse', 'technician', 'highFlyer', 'brawler', 'striker'] as const) {
      const sides = [side('all', competitor('all')), side('other', competitor('other', { style }))];
      expect(chanceOf(sides, 'standard', 'all')).toBeCloseTo(0.5, 10);
    }
  });

  it('averages the edge over every opposing member', () => {
    const power = side('power', competitor('p', { style: 'powerhouse' }));
    const mixed = side('mixed', competitor('f', { style: 'highFlyer' }), competitor('s', { style: 'striker' }));
    // powerhouse beats highFlyer (+1) and loses to striker (−1).
    expect(netStyleEdge(power, [power, mixed])).toBe(0);
    // highFlyer loses to powerhouse (−1); striker beats powerhouse (+1).
    expect(netStyleEdge(mixed, [power, mixed])).toBe(0);
  });
});

describe('specialty', () => {
  it('favours the side fighting in its specialty', () => {
    const sides = [
      side('spec', competitor('spec', { style: 'technician', specialty: 'technical' })),
      side('plain', competitor('plain', { style: 'technician' })),
    ];
    expect(chanceOf(sides, 'technical', 'spec')).toBeGreaterThan(0.5);
    const result = simulate(sides, { category: 'technical', seed: 1 });
    expect(result.specialtyHits).toEqual(['spec']);
  });

  it('has no effect outside the category', () => {
    const sides = [
      side('spec', competitor('spec', { style: 'technician', specialty: 'technical' })),
      side('plain', competitor('plain', { style: 'technician' })),
    ];
    expect(chanceOf(sides, 'cage', 'spec')).toBeCloseTo(0.5, 10);
    expect(chanceOf(sides, 'standard', 'spec')).toBeCloseTo(0.5, 10);
    expect(simulate(sides, { category: 'cage', seed: 1 }).specialtyHits).toEqual([]);
  });

  it('gives allRounder the smaller bonus', () => {
    const plain = competitorRating(competitor('a'), 'hardcore');
    const allRounder = competitorRating(competitor('a', { specialty: 'hardcore' }), 'hardcore');
    const brawler = competitorRating(competitor('b', { style: 'brawler', specialty: 'hardcore' }), 'hardcore');
    expect(allRounder).toBeCloseTo(plain * (1 + ALL_ROUNDER_SPECIALTY_BONUS), 10);
    expect(brawler).toBeCloseTo(plain * (1 + SPECIALTY_BONUS), 10);
  });
});

describe('category weighting', () => {
  it('a high-agility build gains in highRisk compared with standard', () => {
    const flyer = competitor('flyer', { effectiveStats: stats({ agility: 95, strikes: 50, grapple: 50, endurance: 50 }) });
    const allRound = competitor('even', { effectiveStats: stats({ agility: 61, strikes: 61, grapple: 61, endurance: 61 }) });
    const sides = [side('flyer', flyer), side('even', allRound)];
    expect(chanceOf(sides, 'highRisk', 'flyer')).toBeGreaterThan(chanceOf(sides, 'standard', 'flyer'));
    expect(competitorRating(flyer, 'highRisk')).toBeGreaterThan(competitorRating(flyer, 'standard'));
  });
});

describe('tag teams', () => {
  it('rates a mismatched pair as the average of its members', () => {
    const strong = competitor('strong', { effectiveStats: stats({ strikes: 90, grapple: 90, agility: 90, endurance: 90 }) });
    const weak = competitor('weak');
    const pair = side('pair', strong, weak);
    const opponents = side('opp', competitor('x'), competitor('y'));
    const expected = (competitorRating(strong, 'standard') + competitorRating(weak, 'standard')) / 2;
    expect(sideRating(pair, [pair, opponents], 'standard')).toBeCloseTo(expected, 10);

    const result = simulate([pair, opponents], { category: 'standard', seed: 5 });
    expect(result.competitors.map((entry) => entry.sideId)).toEqual(['pair', 'pair', 'opp', 'opp']);
    expect(result.ratings[0].memberMean).toBeCloseTo(expected, 10);
  });
});
