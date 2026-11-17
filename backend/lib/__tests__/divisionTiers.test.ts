import { describe, it, expect } from 'vitest';
import {
  compareDivisionsByTier,
  getDivisionAbove,
  getDivisionBelow,
  getDivisionRank,
  getDivisionTier,
  getSiblingDivisions,
  isDivisionAbove,
  sortDivisionsByTier,
  validateDivisionTier,
} from '../divisionTiers';
import type { Division } from '../repositories/types';

function division(divisionId: string, extra: Partial<Division> = {}): Division {
  return {
    divisionId,
    name: divisionId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

const raw = division('raw', { name: 'Raw', tier: 1 });
const smackdown = division('smackdown', { name: 'SmackDown', tier: 1 });
const nxt = division('nxt', { name: 'NXT', tier: 2 });
const youngBoys = division('young-boys', { name: 'Young Boys', isDevelopmental: true });
const dojo = division('dojo', { name: 'Dojo', isDevelopmental: true, tier: 1 });
const legends = division('legends', { name: 'Legends' });
const league = [youngBoys, legends, nxt, smackdown, raw];

const ids = (divisions: Division[]): string[] => divisions.map((d) => d.divisionId);

describe('getDivisionTier / getDivisionRank', () => {
  it('reads numeric tiers and treats missing or null as none', () => {
    expect(getDivisionTier(raw)).toBe(1);
    expect(getDivisionTier(legends)).toBeUndefined();
    expect(getDivisionTier({ tier: null as unknown as number })).toBeUndefined();
  });

  it('ranks developmental divisions below everything, ignoring their tier', () => {
    expect(getDivisionRank(dojo)).toBe(Number.POSITIVE_INFINITY);
    expect(getDivisionRank(nxt)).toBe(2);
    expect(getDivisionRank(legends)).toBeUndefined();
  });
});

describe('getDivisionAbove', () => {
  it('returns every sibling one tier up', () => {
    expect(ids(getDivisionAbove(league, 'nxt'))).toEqual(['raw', 'smackdown']);
  });

  it('returns the lowest tier above a developmental division', () => {
    expect(ids(getDivisionAbove(league, 'young-boys'))).toEqual(['nxt']);
  });

  it('skips tier gaps', () => {
    const gappy = [raw, division('tier5', { tier: 5 })];
    expect(ids(getDivisionAbove(gappy, 'tier5'))).toEqual(['raw']);
  });

  it('is empty for the top tier, untiered divisions and unknown ids', () => {
    expect(getDivisionAbove(league, 'raw')).toEqual([]);
    expect(getDivisionAbove(league, 'legends')).toEqual([]);
    expect(getDivisionAbove(league, 'missing')).toEqual([]);
  });

  it('is empty for a developmental division when nothing is tiered', () => {
    expect(getDivisionAbove([youngBoys, legends], 'young-boys')).toEqual([]);
  });
});

describe('getDivisionBelow', () => {
  it('returns the next tier down, never untiered divisions', () => {
    expect(ids(getDivisionBelow(league, 'raw'))).toEqual(['nxt']);
    expect(ids(getDivisionBelow(league, 'smackdown'))).toEqual(['nxt']);
  });

  it('returns developmental divisions below the lowest tier', () => {
    expect(ids(getDivisionBelow([...league, dojo], 'nxt'))).toEqual(['dojo', 'young-boys']);
  });

  it('is empty for developmental, untiered and unknown divisions', () => {
    expect(getDivisionBelow(league, 'young-boys')).toEqual([]);
    expect(getDivisionBelow(league, 'legends')).toEqual([]);
    expect(getDivisionBelow(league, 'missing')).toEqual([]);
  });
});

describe('getSiblingDivisions', () => {
  it('returns others on the same tier', () => {
    expect(ids(getSiblingDivisions(league, 'raw'))).toEqual(['smackdown']);
    expect(ids(getSiblingDivisions([...league, dojo], 'young-boys'))).toEqual(['dojo']);
  });

  it('is empty for untiered divisions', () => {
    expect(getSiblingDivisions([...league, division('other')], 'legends')).toEqual([]);
  });
});

describe('isDivisionAbove', () => {
  it('compares across any number of rungs', () => {
    expect(isDivisionAbove(league, 'raw', 'young-boys')).toBe(true);
    expect(isDivisionAbove(league, 'nxt', 'raw')).toBe(false);
    expect(isDivisionAbove(league, 'raw', 'smackdown')).toBe(false);
  });

  it('is false when either side is untiered or unknown', () => {
    expect(isDivisionAbove(league, 'legends', 'young-boys')).toBe(false);
    expect(isDivisionAbove(league, 'raw', 'legends')).toBe(false);
    expect(isDivisionAbove(league, 'raw', 'missing')).toBe(false);
  });
});

describe('sortDivisionsByTier', () => {
  it('orders tiered, then untiered, then developmental, ties by name', () => {
    expect(ids(sortDivisionsByTier([...league, dojo]))).toEqual([
      'raw',
      'smackdown',
      'nxt',
      'legends',
      'dojo',
      'young-boys',
    ]);
  });

  it('does not mutate its input', () => {
    const input = [nxt, raw];
    sortDivisionsByTier(input);
    expect(ids(input)).toEqual(['nxt', 'raw']);
  });

  it('compareDivisionsByTier orders by position', () => {
    expect(compareDivisionsByTier(raw, raw)).toBe(0);
    expect(compareDivisionsByTier(raw, nxt)).toBeLessThan(0);
    expect(compareDivisionsByTier(youngBoys, legends)).toBeGreaterThan(0);
  });
});

describe('validateDivisionTier', () => {
  it('accepts integers 1-99, null and undefined', () => {
    for (const value of [1, 2, 99, null, undefined]) {
      expect(validateDivisionTier(value)).toBeNull();
    }
  });

  it('rejects anything else', () => {
    for (const value of [0, -1, 100, 1.5, '1', true, Number.NaN]) {
      expect(validateDivisionTier(value)).toMatch(/^tier must be an integer/);
    }
  });
});
