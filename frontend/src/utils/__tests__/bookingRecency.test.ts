import { describe, it, expect } from 'vitest';
import type { Player, PlayerBookingInfo } from '../../types';
import { compareByBookingRecency, formatShortDate, isFreshBooking } from '../bookingRecency';

const p = (id: string, name: string) => ({ playerId: id, name } as Player);
const i = (lastBookedAt: string | null): PlayerBookingInfo => ({ lastBookedAt, currentStreak: { type: 'W', count: 0 } });

describe('compareByBookingRecency', () => {
  it('orders never → oldest → newest → name', () => {
    const info = new Map([
      ['a', i('2026-09-01T00:00:00Z')],
      ['b', i(null)],
      ['c', i('2026-08-01T00:00:00Z')],
      ['d', i('2026-08-01T00:00:00Z')],
    ]);
    const sorted = [p('a', 'Zed'), p('d', 'Bob'), p('c', 'Amy'), p('b', 'Kim')]
      .sort((x, y) => compareByBookingRecency(x, y, info))
      .map((x) => x.playerId);
    expect(sorted).toEqual(['b', 'c', 'd', 'a']);
  });

  it('treats a player missing from the map as never booked', () => {
    const info = new Map([['a', i('2026-09-01T00:00:00Z')]]);
    expect(compareByBookingRecency(p('x', 'X'), p('a', 'A'), info)).toBeLessThan(0);
  });

  it('is name-only without info', () => {
    expect(compareByBookingRecency(p('a', 'Amy'), p('b', 'Bob'))).toBeLessThan(0);
  });
});

describe('isFreshBooking', () => {
  const now = new Date('2026-09-10T00:00:00Z');
  it('is fresh when never booked or 14+ days ago', () => {
    expect(isFreshBooking(null, now)).toBe(true);
    expect(isFreshBooking('2026-08-27T00:00:00Z', now)).toBe(true);
    expect(isFreshBooking('2026-08-28T00:00:00Z', now)).toBe(false);
    expect(isFreshBooking('not a date', now)).toBe(false);
  });
});

describe('formatShortDate', () => {
  it('drops the year for the current year', () => {
    const now = new Date('2026-09-10T00:00:00Z');
    expect(formatShortDate('2026-08-29T20:00:00Z', now)).toMatch(/Aug 29/);
    expect(formatShortDate('2025-08-29T20:00:00Z', now)).toMatch(/2025/);
  });
});
