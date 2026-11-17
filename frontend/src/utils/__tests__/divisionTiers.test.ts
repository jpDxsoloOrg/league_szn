import { describe, it, expect } from 'vitest';
import { divisionTierSortValue, sortDivisionsByTier } from '../divisionTiers';
import type { Division } from '../../types';

function division(name: string, extra: Partial<Division> = {}): Division {
  return { divisionId: name, name, createdAt: '', updatedAt: '', ...extra };
}

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
