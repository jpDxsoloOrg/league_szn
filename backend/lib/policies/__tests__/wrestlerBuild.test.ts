import { describe, it, expect } from 'vitest';
import type { WrestlerBuild } from '../../repositories/types';
import {
  CORE_STATS,
  FINISHER_LEVEL_COST,
  SIGNATURE_LEVEL_COST,
  SPECIALTY_CATEGORIES,
  STAT_BASE,
  STAT_CAP,
  STYLE_IDS,
  type CoreStat,
} from '../buildRules';
import {
  budgetStatus,
  buildCost,
  defaultBuild,
  effectiveBuild,
  statCost,
  validateBuild,
} from '../wrestlerBuild';

function stats(values: Partial<Record<CoreStat, number>> = {}): Record<CoreStat, number> {
  return { strikes: STAT_BASE, grapple: STAT_BASE, agility: STAT_BASE, endurance: STAT_BASE, ...values };
}

function build(overrides: Partial<WrestlerBuild> = {}): WrestlerBuild {
  return { style: 'allRounder', stats: stats(), updatedAt: '2026-11-24T00:00:00.000Z', ...overrides };
}

describe('statCost', () => {
  it('prices each band', () => {
    expect(statCost(STAT_BASE)).toBe(0);
    expect(statCost(41)).toBe(1);
    expect(statCost(75)).toBe(35);
    expect(statCost(76)).toBe(37);
    expect(statCost(90)).toBe(65);
    expect(statCost(91)).toBe(68);
    expect(statCost(100)).toBe(95);
  });
});

describe('buildCost', () => {
  it('sums stat costs and move levels above 1', () => {
    const cost = buildCost(
      build({ stats: stats({ strikes: 75, grapple: 50 }) }),
      [{ level: 3 }, { level: 1 }],
      [{ level: 2 }],
    );
    expect(cost).toBe(35 + 10 + 2 * SIGNATURE_LEVEL_COST + FINISHER_LEVEL_COST);
  });

  it('counts moves without a level as level 1', () => {
    expect(buildCost(build(), [{}, {}], [{}])).toBe(0);
  });

  it('does not charge for the specialty', () => {
    expect(buildCost(build({ specialty: 'cage' }), [], [])).toBe(0);
  });
});

describe('budgetStatus', () => {
  it('reports remaining and overBudget', () => {
    expect(budgetStatus(70, 80)).toEqual({ cost: 70, budget: 80, remaining: 10, overBudget: false });
    expect(budgetStatus(80, 80).overBudget).toBe(false);
    expect(budgetStatus(85, 80)).toEqual({ cost: 85, budget: 80, remaining: -5, overBudget: true });
  });
});

describe('validateBuild', () => {
  const exact = build({ stats: stats({ strikes: 75, grapple: 75 }) }); // 70 points

  it('accepts a build that costs exactly the budget', () => {
    const result = validateBuild(exact, {}, 70);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toEqual(budgetStatus(70, 70));
      expect(result.build).toEqual({ style: 'allRounder', stats: exact.stats });
    }
  });

  it('rejects a build one point over budget, with cost and budget in the details', () => {
    const result = validateBuild(build({ stats: stats({ strikes: 75, grapple: 76 }) }), {}, 71);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({ code: 'OVER_BUDGET', details: { cost: 72, budget: 71 } });
    }
  });

  it('includes move levels in the budget check', () => {
    expect(validateBuild(build(), { finishers: [{ level: 2 }] }, FINISHER_LEVEL_COST).ok).toBe(true);
    expect(validateBuild(build(), { finishers: [{ level: 2 }] }, FINISHER_LEVEL_COST - 1).ok).toBe(false);
  });

  it('rejects an unknown style', () => {
    const result = validateBuild({ style: 'luchador', stats: stats() }, {}, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toEqual(['INVALID_STYLE']);
  });

  it('rejects non-integer, out-of-range, missing and unknown stats', () => {
    const result = validateBuild(
      { style: 'striker', stats: { strikes: 50.5, grapple: 39, agility: 101, power: 60 } },
      {},
      200,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const fields = result.errors.map((error) => `${error.code}:${error.field}`);
      expect(fields).toEqual(
        expect.arrayContaining([
          'UNKNOWN_STAT:stats.power',
          'INVALID_STAT:stats.strikes',
          'INVALID_STAT:stats.grapple',
          'INVALID_STAT:stats.agility',
          'MISSING_STAT:stats.endurance',
        ]),
      );
      expect(result.errors.some((error) => error.code === 'OVER_BUDGET')).toBe(false);
    }
  });

  it('rejects stats that are not an object', () => {
    const result = validateBuild({ style: 'striker', stats: null }, {}, 100);
    expect(!result.ok && result.errors[0].code).toBe('INVALID_STATS');
  });

  it('rejects move levels outside 1..5 or non-integer', () => {
    const result = validateBuild(
      build(),
      { signatures: [{ level: 0 }, { level: 2 }], finishers: [{ level: 6 }, { level: 1.5 }] },
      1000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.field)).toEqual([
        'signatures[0].level',
        'finishers[0].level',
        'finishers[1].level',
      ]);
    }
  });

  it('rejects powerhouse + highRisk, naming the style and what it allows', () => {
    const result = validateBuild(build({ style: 'powerhouse', specialty: 'highRisk' }), {}, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatchObject({
        code: 'SPECIALTY_NOT_ALLOWED',
        details: { style: 'powerhouse', allowed: ['hardcore', 'cage'] },
      });
      expect(result.errors[0].message).toContain('powerhouse');
      expect(result.errors[0].message).toContain('hardcore, cage');
    }
  });

  it('accepts powerhouse + cage', () => {
    const result = validateBuild(build({ style: 'powerhouse', specialty: 'cage' }), {}, 100);
    expect(result.ok && result.build.specialty).toBe('cage');
  });

  it('accepts allRounder with every non-standard category', () => {
    for (const category of SPECIALTY_CATEGORIES) {
      expect(validateBuild(build({ specialty: category }), {}, 100).ok).toBe(true);
    }
  });

  it('rejects standard as a specialty for every style', () => {
    for (const style of STYLE_IDS) {
      const result = validateBuild(build({ style, specialty: 'standard' }), {}, 100);
      expect(!result.ok && result.errors[0].code).toBe('SPECIALTY_NOT_ALLOWED');
    }
  });

  it('rejects an unknown specialty', () => {
    const result = validateBuild({ style: 'allRounder', specialty: 'mud', stats: stats() }, {}, 100);
    expect(!result.ok && result.errors[0].code).toBe('INVALID_SPECIALTY');
  });

  it('accepts no specialty (undefined or null)', () => {
    expect(validateBuild({ style: 'striker', stats: stats() }, {}, 0).ok).toBe(true);
    expect(validateBuild({ style: 'striker', specialty: null, stats: stats() }, {}, 0).ok).toBe(true);
  });
});

describe('effectiveBuild', () => {
  it('adds the style bonus within budget and keeps the specialty', () => {
    const result = effectiveBuild(
      build({ style: 'powerhouse', specialty: 'cage', stats: stats({ grapple: 60 }) }),
      { signatures: [{ level: 2 }], finishers: [{}] },
      100,
    );
    expect(result.scaled).toBe(false);
    expect(result.spentStats.grapple).toBe(60);
    expect(result.stats).toEqual(stats({ grapple: 68 }));
    expect(result.signatureLevels).toEqual([2]);
    expect(result.finisherLevels).toEqual([1]);
    expect(result.specialty).toBe('cage');
  });

  it('caps the style bonus at the stat cap', () => {
    const result = effectiveBuild(build({ style: 'striker', stats: stats({ strikes: 96 }) }), {}, 1000);
    expect(result.stats.strikes).toBe(STAT_CAP);
  });

  it('scales an over-budget build to fit, never below base or level 1', () => {
    const saved = build({
      style: 'technician',
      specialty: 'technical',
      stats: { strikes: 90, grapple: 100, agility: 75, endurance: 41 },
    });
    const moves = { signatures: [{ level: 5 }, { level: 2 }], finishers: [{ level: 4 }] };
    const budget = 80;
    const result = effectiveBuild(saved, moves, budget);

    expect(result.scaled).toBe(true);
    expect(result.status.overBudget).toBe(true);
    const scaledCost = buildCost(
      { stats: result.spentStats },
      result.signatureLevels.map((level) => ({ level })),
      result.finisherLevels.map((level) => ({ level })),
    );
    expect(scaledCost).toBeLessThanOrEqual(budget);
    for (const stat of CORE_STATS) {
      expect(result.spentStats[stat]).toBeGreaterThanOrEqual(STAT_BASE);
      expect(result.spentStats[stat]).toBeLessThanOrEqual(saved.stats[stat]);
    }
    for (const level of [...result.signatureLevels, ...result.finisherLevels]) {
      expect(level).toBeGreaterThanOrEqual(1);
    }
    expect(result.specialty).toBe('technical');
    expect(result.stats.grapple).toBe(Math.min(STAT_CAP, result.spentStats.grapple + 4));
  });

  it('fits many budgets', () => {
    const saved = build({ stats: { strikes: 100, grapple: 88, agility: 63, endurance: 77 } });
    const moves = { signatures: [{ level: 5 }, { level: 3 }], finishers: [{ level: 5 }] };
    for (let budget = 0; budget <= 160; budget += 7) {
      const result = effectiveBuild(saved, moves, budget);
      const cost = buildCost(
        { stats: result.spentStats },
        result.signatureLevels.map((level) => ({ level })),
        result.finisherLevels.map((level) => ({ level })),
      );
      expect(cost).toBeLessThanOrEqual(budget);
    }
  });

  it('drops everything to base with a zero budget', () => {
    const result = effectiveBuild(
      build({ style: 'brawler', stats: stats({ strikes: 90 }) }),
      { finishers: [{ level: 5 }] },
      0,
    );
    expect(result.spentStats).toEqual(stats());
    expect(result.finisherLevels).toEqual([1]);
    expect(result.stats).toEqual(stats({ strikes: 44, endurance: 44 }));
  });
});

describe('defaultBuild', () => {
  it('is allRounder at base with no specialty, and costs nothing', () => {
    const fresh = defaultBuild();
    expect(fresh.style).toBe('allRounder');
    expect(fresh.specialty).toBeUndefined();
    expect(fresh.stats).toEqual(stats());
    expect(buildCost(fresh, [], [])).toBe(0);
    expect(validateBuild(fresh, {}, 0).ok).toBe(true);
  });
});
