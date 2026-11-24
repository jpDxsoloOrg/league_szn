import { describe, it, expect } from 'vitest';
import { matchResultTime } from '../matchTime';

describe('matchResultTime', () => {
  it('prefers completedAt', () => {
    expect(matchResultTime({ date: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-05T12:00:00.000Z' }))
      .toBe('2026-01-05T12:00:00.000Z');
  });

  it('falls back to the booked date when completedAt is missing', () => {
    expect(matchResultTime({ date: '2026-01-01T00:00:00.000Z' })).toBe('2026-01-01T00:00:00.000Z');
  });
});
