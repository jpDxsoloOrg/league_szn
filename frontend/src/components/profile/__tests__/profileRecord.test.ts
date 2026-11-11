import { describe, it, expect } from 'vitest';
import { getWinPercentage } from '../profileRecord';

describe('getWinPercentage', () => {
  it('gives a dash with no matches played', () => {
    expect(getWinPercentage({ wins: 0, losses: 0, draws: 0 })).toBe('-');
  });

  it('counts draws in the total', () => {
    expect(getWinPercentage({ wins: 6, losses: 3, draws: 1 })).toBe('60.0%');
  });
});
