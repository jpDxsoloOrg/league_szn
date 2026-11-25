import { describe, it, expect } from 'vitest';
import {
  MAX_INJURY_CHANCE,
  applyDrain,
  formatKeyForMatch,
  formatMultiplierFor,
  injuryChance,
  matchDrain,
  recover,
  returnDate,
  rollInjury,
  rollSeed,
  severityWeights,
  staminaOf,
  staminaSimMultiplier,
} from '../fatigue';
import { DEFAULT_INJURY_TUNABLES, type InjuryTunables } from '../fatigueDefaults';
import { leagueWeekOf } from '../../leagueWeek';

function tunables(overrides: Partial<InjuryTunables> = {}): InjuryTunables {
  return { ...structuredClone(DEFAULT_INJURY_TUNABLES), ...overrides };
}

const defaults = tunables();

describe('staminaOf', () => {
  it('treats a missing value as full and clamps the rest', () => {
    expect(staminaOf(undefined, defaults)).toBe(100);
    expect(staminaOf(null, defaults)).toBe(100);
    expect(staminaOf(-5, defaults)).toBe(0);
    expect(staminaOf(130, defaults)).toBe(100);
    expect(staminaOf(42, defaults)).toBe(42);
  });
});

describe('formatKeyForMatch', () => {
  it('maps teams and participants onto the default keys', () => {
    expect(formatKeyForMatch({ participants: ['a', 'b'] })).toBe('singles');
    expect(formatKeyForMatch({ participants: ['a', 'b', 'c'] })).toBe('multiPerson');
    expect(formatKeyForMatch({ participants: ['a', 'b', 'c', 'd'], teams: [['a', 'b'], ['c', 'd']] })).toBe('tag');
    expect(formatKeyForMatch({ participants: ['a', 'b', 'c'], teams: [['a'], ['b'], ['c']] })).toBe('multiPerson');
  });

  it('reads the format name', () => {
    expect(formatKeyForMatch({ matchFormat: 'Tag Team' })).toBe('tag');
    expect(formatKeyForMatch({ matchFormat: '6-Man Tag' })).toBe('tag');
    expect(formatKeyForMatch({ matchFormat: 'Battle Royal', participants: ['a', 'b', 'c', 'd'] })).toBe('battleRoyal');
    expect(formatKeyForMatch({ matchType: 'Singles' })).toBe('singles');
    expect(formatKeyForMatch({ matchFormat: 'Triple Threat' })).toBe('multiPerson');
    expect(formatKeyForMatch({ matchFormat: 'Unknown' })).toBeUndefined();
    expect(formatKeyForMatch({})).toBeUndefined();
  });

  it('prefers a GM-configured key that names the format', () => {
    const custom = tunables({ formatMultiplier: { ...defaults.formatMultiplier, ladder: 1.2 } });
    expect(formatKeyForMatch({ matchFormat: 'Ladder', participants: ['a', 'b'] }, custom)).toBe('ladder');
    expect(formatKeyForMatch({ matchFormat: 'Ladder', participants: ['a', 'b'] })).toBe('singles');
  });

  it('uses 1 for unknown keys', () => {
    expect(formatMultiplierFor(undefined, defaults)).toBe(1);
    expect(formatMultiplierFor('ironMan', defaults)).toBe(1);
    expect(formatMultiplierFor('tag', defaults)).toBe(0.7);
  });
});

describe('matchDrain', () => {
  it('uses the category drain at base endurance in singles', () => {
    expect(matchDrain({ category: 'standard', format: 'singles' }, defaults)).toBe(15);
    expect(matchDrain({ category: 'highRisk', format: 'singles', endurance: 40 }, defaults)).toBe(25);
    expect(matchDrain({ category: 'endurance', format: 'singles' }, defaults)).toBe(30);
    expect(matchDrain({ category: 'technical' }, defaults)).toBe(20);
  });

  it('applies the format multiplier', () => {
    expect(matchDrain({ category: 'endurance', format: 'tag' }, defaults)).toBe(21);
    expect(matchDrain({ category: 'endurance', format: 'multiPerson' }, defaults)).toBe(24);
    expect(matchDrain({ category: 'endurance', format: 'battleRoyal' }, defaults)).toBe(18);
    expect(matchDrain({ category: 'endurance', format: 'unheardOf' }, defaults)).toBe(30);
  });

  it('lowers drain as endurance rises', () => {
    const atBase = matchDrain({ category: 'endurance', endurance: 40 }, defaults);
    const mid = matchDrain({ category: 'endurance', endurance: 70 }, defaults);
    const capped = matchDrain({ category: 'endurance', endurance: 100 }, defaults);
    expect(mid).toBeLessThan(atBase);
    expect(capped).toBeLessThan(mid);
    expect(capped).toBe(21); // 30 × (1 − 0.3)
    expect(matchDrain({ category: 'endurance', endurance: 500 }, defaults)).toBe(capped);
  });

  it('never goes negative, even with an extreme reduction', () => {
    const extreme = tunables({ enduranceDrainReduction: 5 });
    expect(matchDrain({ category: 'cage', endurance: 100 }, extreme)).toBe(0);
  });
});

describe('applyDrain', () => {
  it('clamps to [0, max]', () => {
    expect(applyDrain(100, 15, defaults)).toBe(85);
    expect(applyDrain(10, 25, defaults)).toBe(0);
    expect(applyDrain(100, -10, defaults)).toBe(100);
  });
});

describe('injuryChance', () => {
  it('picks the band at its edges', () => {
    expect(injuryChance(70, 'standard', defaults)).toBe(0.01);
    expect(injuryChance(69, 'standard', defaults)).toBe(0.03);
    expect(injuryChance(40, 'standard', defaults)).toBe(0.03);
    expect(injuryChance(39, 'standard', defaults)).toBe(0.08);
    expect(injuryChance(0, 'standard', defaults)).toBe(0.15);
  });

  it('scales by category risk', () => {
    expect(injuryChance(0, 'hardcore', defaults)).toBeCloseTo(0.225);
    expect(injuryChance(100, 'cage', defaults)).toBeCloseTo(0.013);
  });

  it('caps at 0.95', () => {
    const risky = tunables({ injuryChanceBands: [{ minStamina: 0, chance: 0.9 }] });
    expect(injuryChance(0, 'hardcore', risky)).toBe(MAX_INJURY_CHANCE);
  });

  it('applies a chance reduction after the cap', () => {
    const risky = tunables({ injuryChanceBands: [{ minStamina: 0, chance: 0.9 }] });
    expect(injuryChance(0, 'hardcore', risky, { chanceReduction: 0.5 })).toBeCloseTo(0.475);
    expect(injuryChance(0, 'standard', defaults, { chanceReduction: 1 })).toBe(0);
    expect(injuryChance(0, 'standard', defaults, { chanceReduction: 2 })).toBe(0);
  });

  it('does not depend on band order', () => {
    const unsorted = tunables({ injuryChanceBands: [...defaults.injuryChanceBands].reverse() });
    expect(injuryChance(69, 'standard', unsorted)).toBe(0.03);
  });
});

describe('rollSeed and rollInjury', () => {
  it('is stable for the same inputs and independent per player and version', () => {
    expect(rollSeed('m1', 'p1', 3)).toBe(rollSeed('m1', 'p1', 3));
    expect(rollSeed('m1', 'p1', 3)).not.toBe(rollSeed('m1', 'p2', 3));
    expect(rollSeed('m1', 'p1', 3)).not.toBe(rollSeed('m1', 'p1', 4));
    expect(Number.isInteger(rollSeed('m1', 'p1', 3))).toBe(true);
    expect(rollSeed('m1', 'p1', 3)).toBeGreaterThanOrEqual(0);
    expect(rollSeed('m1', 'p1', 3)).toBeLessThan(2 ** 32);
  });

  it('gives the same result for the same seed', () => {
    const seed = rollSeed('match-42', 'player-7', 1);
    expect(rollInjury(10, 'hardcore', seed, defaults)).toEqual(rollInjury(10, 'hardcore', seed, defaults));
  });

  it('gives different players independent rolls', () => {
    const rolls = new Set(
      Array.from({ length: 20 }, (_, index) => rollInjury(50, 'standard', rollSeed('m1', `p${index}`, 1), defaults).roll),
    );
    expect(rolls.size).toBe(20);
  });

  it('injures exactly when roll < chance, with a severity and weeks in range', () => {
    const always = tunables({ injuryChanceBands: [{ minStamina: 0, chance: 0.95 }] });
    let injuries = 0;
    for (let index = 0; index < 200; index += 1) {
      const result = rollInjury(50, 'standard', rollSeed('m', `p${index}`, 1), always);
      expect(result.injured).toBe(result.roll < result.chance);
      if (!result.injured) {
        expect(result.severity).toBeUndefined();
        continue;
      }
      injuries += 1;
      const severity = always.severities.find((item) => item.key === result.severity);
      expect(severity).toBeDefined();
      expect(result.weeks).toBeGreaterThanOrEqual(severity!.minWeeks);
      expect(result.weeks).toBeLessThanOrEqual(severity!.maxWeeks);
    }
    expect(injuries).toBeGreaterThan(150);
  });

  it('never injures at chance 0, and a reduction keeps the roll', () => {
    const none = tunables({ injuryChanceBands: [{ minStamina: 0, chance: 0 }] });
    const seed = rollSeed('m', 'p', 1);
    expect(rollInjury(0, 'hardcore', seed, none).injured).toBe(false);
    expect(rollInjury(0, 'hardcore', seed, defaults, { chanceReduction: 0.5 }).roll)
      .toBe(rollInjury(0, 'hardcore', seed, defaults).roll);
  });

  function severityShares(staminaAfter: number, seeds: number): Record<string, number> {
    const always = tunables({ injuryChanceBands: [{ minStamina: 0, chance: 0.95 }] });
    const counts: Record<string, number> = { minor: 0, moderate: 0, major: 0 };
    let injuries = 0;
    for (let index = 0; index < seeds; index += 1) {
      const result = rollInjury(staminaAfter, 'standard', rollSeed(`match-${index}`, 'player', 1), always);
      if (!result.injured || !result.severity) continue;
      counts[result.severity] += 1;
      injuries += 1;
    }
    return Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, count / injuries]));
  }

  it('keeps the severity distribution within ±2% of the weights over 10k seeds', () => {
    const shares = severityShares(80, 10_000);
    expect(Math.abs(shares.minor - 0.6)).toBeLessThan(0.02);
    expect(Math.abs(shares.moderate - 0.3)).toBeLessThan(0.02);
    expect(Math.abs(shares.major - 0.1)).toBeLessThan(0.02);
  });

  it('makes major injuries more likely at low stamina', () => {
    expect(severityWeights(20, defaults)).toEqual([60, 30, 10]);
    expect(severityWeights(0, defaults)).toEqual([60, 60, 30]);
    const shares = severityShares(0, 10_000);
    expect(Math.abs(shares.major - 30 / 150)).toBeLessThan(0.02);
    expect(shares.major).toBeGreaterThan(severityShares(80, 10_000).major + 0.05);
  });
});

describe('returnDate', () => {
  const zone = 'America/New_York';

  function expectSundayMidnight(date: Date, timeZone: string): void {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
    expect(value('weekday')).toBe('Sun');
    expect(`${value('hour')}:${value('minute')}:${value('second')}`).toBe('00:00:00');
  }

  it('lands on the first Sunday at or after the full weeks', () => {
    // Wednesday 2026-11-18 15:00 New York.
    const injuredAt = new Date('2026-11-18T20:00:00Z');
    expect(returnDate(injuredAt, 1, zone).toISOString()).toBe('2026-11-29T05:00:00.000Z');
    expect(returnDate(injuredAt, 2, zone).toISOString()).toBe('2026-12-06T05:00:00.000Z');
  });

  it('counts an injury exactly at the boundary as a full week', () => {
    const boundary = new Date('2026-11-22T05:00:00Z'); // Sunday 00:00 New York
    expect(returnDate(boundary, 1, zone).toISOString()).toBe('2026-11-29T05:00:00.000Z');
    expect(returnDate(boundary.toISOString(), 1, zone).toISOString()).toBe('2026-11-29T05:00:00.000Z');
  });

  it('always lands on Sunday 00:00 local, across DST changes', () => {
    const zones = ['America/New_York', 'Europe/Berlin', 'Australia/Sydney', 'UTC'];
    const start = Date.UTC(2026, 0, 1);
    for (const timeZone of zones) {
      for (let hour = 0; hour < 365 * 24; hour += 37) {
        const injuredAt = new Date(start + hour * 60 * 60 * 1000);
        for (const weeks of [1, 3, 6]) {
          const back = returnDate(injuredAt, weeks, timeZone);
          expectSundayMidnight(back, timeZone);
          expect(back.getTime()).toBeGreaterThanOrEqual(injuredAt.getTime() + weeks * 7 * 24 * 3600 * 1000 - 3600 * 1000);
          expect(back.getTime()).toBe(leagueWeekOf(back, timeZone).weekStart.getTime());
        }
      }
    }
  });

  it('handles the spring-forward week', () => {
    // US DST starts Sunday 2026-03-08; injured the Wednesday before.
    const back = returnDate(new Date('2026-03-04T17:00:00Z'), 1, zone);
    expect(back.toISOString()).toBe('2026-03-15T04:00:00.000Z');
  });
});

describe('recover', () => {
  it('restores full stamina', () => {
    expect(recover(12, defaults)).toBe(100);
  });

  it('adds a fixed amount, capped', () => {
    const plus = tunables({ weeklyRecovery: 30 });
    expect(recover(12, plus)).toBe(42);
    expect(recover(90, plus)).toBe(100);
  });
});

describe('staminaSimMultiplier', () => {
  it('scales linearly from the floor to 1', () => {
    expect(staminaSimMultiplier(100, false, defaults)).toBe(1);
    expect(staminaSimMultiplier(0, false, defaults)).toBeCloseTo(0.85);
    expect(staminaSimMultiplier(50, false, defaults)).toBeCloseTo(0.925);
    expect(staminaSimMultiplier(-10, false, defaults)).toBeCloseTo(0.85);
  });

  it('stacks the injured penalty', () => {
    expect(staminaSimMultiplier(100, true, defaults)).toBeCloseTo(0.75);
    expect(staminaSimMultiplier(0, true, defaults)).toBeCloseTo(0.6375);
  });
});
