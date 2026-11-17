import { describe, it, expect } from 'vitest';
import {
  divisionTierSortValue,
  getAdjacentDivisions,
  getDivisionRank,
  getStandingsZone,
  getStandingsZoneSizes,
  sortDivisionsByTier,
} from '../divisionTiers';
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

describe('standings zones (DMV-07)', () => {
  const ladder = [
    division('Raw', { tier: 1 }),
    division('NXT', { tier: 2, relegationZoneSize: 3 }),
    division('Young Boys', { isDevelopmental: true }),
    division('Legends'),
  ];

  it('gives the top tier no promotion zone and the bottom division no relegation zone', () => {
    expect(getStandingsZoneSizes(ladder, 'Raw', true)).toEqual({ promotion: 0, relegation: 2 });
    expect(getStandingsZoneSizes(ladder, 'Young Boys', true)).toEqual({ promotion: 2, relegation: 0 });
  });

  it('uses stored sizes and hides relegation when not allowed', () => {
    expect(getStandingsZoneSizes(ladder, 'NXT', true)).toEqual({ promotion: 2, relegation: 3 });
    expect(getStandingsZoneSizes(ladder, 'NXT', false)).toEqual({ promotion: 2, relegation: 0 });
  });

  it('gives untiered and unknown divisions no zones', () => {
    expect(getStandingsZoneSizes(ladder, 'Legends', true)).toEqual({ promotion: 0, relegation: 0 });
    expect(getStandingsZoneSizes(ladder, 'missing', true)).toEqual({ promotion: 0, relegation: 0 });
  });

  it('places ranks in zones, promotion first when they overlap', () => {
    const sizes = { promotion: 2, relegation: 2 };
    expect([1, 2, 3, 4, 5, 6].map((rank) => getStandingsZone(rank, 6, sizes)))
      .toEqual(['promotion', 'promotion', undefined, undefined, 'relegation', 'relegation']);
    expect([1, 2, 3].map((rank) => getStandingsZone(rank, 3, sizes))).toEqual(['promotion', 'promotion', 'relegation']);
    expect(getStandingsZone(7, 6, sizes)).toBeUndefined();
  });
});
