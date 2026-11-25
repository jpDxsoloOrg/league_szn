import { describe, expect, it } from 'vitest';
import { buildCost, maxAffordableStat, moveLevelCost, nextStatPointCost, statCost } from '../buildCost';
import { buildRulesFixture } from '../../test/buildRulesFixture';

const rules = buildRulesFixture();
const baseStats = { strikes: 40, grapple: 40, agility: 40, endurance: 40 };

// Expected values are the fixtures in backend/lib/policies/__tests__/wrestlerBuild.test.ts.
describe('statCost', () => {
  it('matches the backend cost bands', () => {
    expect(statCost(40, rules)).toBe(0);
    expect(statCost(41, rules)).toBe(1);
    expect(statCost(75, rules)).toBe(35);
    expect(statCost(76, rules)).toBe(37);
    expect(statCost(90, rules)).toBe(65);
    expect(statCost(91, rules)).toBe(68);
    expect(statCost(100, rules)).toBe(95);
  });

  it('prices values above the cap as the cap and below base as zero', () => {
    expect(statCost(120, rules)).toBe(95);
    expect(statCost(30, rules)).toBe(0);
  });
});

describe('nextStatPointCost', () => {
  it('is 1, 2 or 3 by band and null at the cap', () => {
    expect(nextStatPointCost(40, rules)).toBe(1);
    expect(nextStatPointCost(75, rules)).toBe(2);
    expect(nextStatPointCost(90, rules)).toBe(3);
    expect(nextStatPointCost(100, rules)).toBeNull();
  });
});

describe('moveLevelCost and buildCost', () => {
  it('charges each level above 1 at the signature or finisher price', () => {
    expect(moveLevelCost([3], [2], rules)).toBe(2 * 5 + 8);
    expect(moveLevelCost([1, 1], [1], rules)).toBe(0);
  });

  it('adds stats and move levels like the backend', () => {
    const stats = { ...baseStats, strikes: 75, grapple: 50 };
    expect(buildCost({ stats, signatureLevels: [3], finisherLevels: [2] }, rules)).toBe(35 + 10 + 2 * 5 + 8);
    expect(buildCost({ stats: baseStats, signatureLevels: [1, 1], finisherLevels: [1] }, rules)).toBe(0);
  });
});

describe('maxAffordableStat', () => {
  it('stops at the budget', () => {
    const input = { stats: baseStats, signatureLevels: [], finisherLevels: [] };
    expect(maxAffordableStat(input, 'strikes', 35, rules)).toBe(75);
    expect(maxAffordableStat(input, 'strikes', 36, rules)).toBe(75);
    expect(maxAffordableStat(input, 'strikes', 37, rules)).toBe(76);
    expect(maxAffordableStat(input, 'strikes', 500, rules)).toBe(100);
  });

  it('never goes below the current value when already over budget', () => {
    const input = { stats: { ...baseStats, strikes: 90 }, signatureLevels: [], finisherLevels: [] };
    expect(maxAffordableStat(input, 'strikes', 10, rules)).toBe(90);
    expect(maxAffordableStat(input, 'grapple', 10, rules)).toBe(40);
  });
});
