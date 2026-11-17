import { describe, it, expect } from 'vitest';
import { divisionTierSortValue, getAdjacentDivisions, getDivisionRank, sortDivisionsByTier } from '../divisionTiers';
import type { Division } from '../../types';

function division(name: string, extra: Partial<Division> = {}): Division {
  return { divisionId: name, name, createdAt: '', updatedAt: '', ...extra };
}

describe('getAdjacentDivisions / getDivisionRank (DMV-05)', () => {
  const ladder = [
    division('Raw', { tier: 1 }),
    division('SmackDown', { tier: 1 }),
    division('NXT', { tier: 2 }),
    division('Young Boys', { isDevelopmental: true }),
    division('Legends'),
  ];

  it('returns every sibling one tier up', () => {
    expect(getAdjacentDivisions(ladder, 'NXT', 'above').map((d) => d.divisionId)).toEqual(['Raw', 'SmackDown']);
  });

  it('puts developmental divisions below the lowest tier', () => {
    expect(getAdjacentDivisions(ladder, 'NXT', 'below').map((d) => d.divisionId)).toEqual(['Young Boys']);
    expect(getDivisionRank({ isDevelopmental: true })).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns nothing above the top tier or for untiered divisions', () => {
    expect(getAdjacentDivisions(ladder, 'Raw', 'above')).toEqual([]);
    expect(getAdjacentDivisions(ladder, 'Legends', 'below')).toEqual([]);
    expect(getDivisionRank({})).toBeUndefined();
  });
});

describe('sortDivisionsByTier', () => {
  it('orders tiered, then untiered, then developmental, ties by name', () => {
    const sorted = sortDivisionsByTier([
      division('Young Boys', { isDevelopmental: true, tier: 1 }),
      division('Legends'),
      division('NXT', { tier: 2 }),
      division('SmackDown', { tier: 1 }),
      division('Raw', { tier: 1 }),
    ]);
    expect(sorted.map((d) => d.name)).toEqual(['Raw', 'SmackDown', 'NXT', 'Legends', 'Young Boys']);
  });

  it('treats a stored null tier as untiered', () => {
    const sorted = sortDivisionsByTier([
      division('Cleared', { tier: null as unknown as number }),
      division('NXT', { tier: 2 }),
    ]);
    expect(sorted.map((d) => d.name)).toEqual(['NXT', 'Cleared']);
  });
});

describe('divisionTierSortValue', () => {
  it('puts untiered after tiered and developmental last', () => {
    expect(divisionTierSortValue(division('Raw', { tier: 1 }))).toBe(1);
    expect(divisionTierSortValue(division('Legends'))).toBeLessThan(
      divisionTierSortValue(division('Young Boys', { isDevelopmental: true })),
    );
    expect(divisionTierSortValue(division('Legends'))).toBeGreaterThan(99);
  });
});
