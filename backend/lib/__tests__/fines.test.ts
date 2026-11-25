import { describe, it, expect } from 'vitest';
import {
  activeNoShows,
  findActiveNoShow,
  formatMoney,
  noShowAttempts,
  noShowFineKey,
  noShowMarkRefusal,
  wentIntoDebt,
} from '../fines';
import type { Match } from '../repositories/types';

const baseMatch: Match = {
  matchId: 'm1',
  date: '2026-11-20T20:00:00.000Z',
  participants: ['p1', 'p2'],
  status: 'scheduled',
  createdAt: '2026-11-01T00:00:00.000Z',
};

describe('fines policy', () => {
  it('keys the first no-show plainly and later ones by attempt', () => {
    expect(noShowFineKey('m1', 'p1', 1)).toBe('match#m1#noshow#p1');
    expect(noShowFineKey('m1', 'p1', 3)).toBe('match#m1#noshow#p1#3');
  });

  it('finds the active mark and counts every attempt', () => {
    const match: Match = {
      ...baseMatch,
      noShows: [
        { playerId: 'p1', markedAt: 'a', undoneAt: 'b' },
        { playerId: 'p2', markedAt: 'c' },
        { playerId: 'p1', markedAt: 'd' },
      ],
    };
    expect(findActiveNoShow(match, 'p1')).toEqual({ mark: { playerId: 'p1', markedAt: 'd' }, index: 2, attempt: 2 });
    expect(noShowAttempts(match, 'p1')).toBe(2);
    expect(activeNoShows(match).map((mark) => mark.playerId)).toEqual(['p2', 'p1']);
    expect(findActiveNoShow(baseMatch, 'p1')).toBeNull();
  });

  it('allows scheduled and recently completed matches only', () => {
    const now = new Date('2026-11-24T00:00:00.000Z');
    expect(noShowMarkRefusal(baseMatch, now)).toBeNull();
    expect(noShowMarkRefusal({ ...baseMatch, status: 'completed', completedAt: '2026-11-20T00:00:00.000Z' }, now)).toBeNull();
    expect(noShowMarkRefusal({ ...baseMatch, status: 'completed', completedAt: '2026-11-10T00:00:00.000Z' }, now)).toMatch(/7 days/);
    expect(noShowMarkRefusal({ ...baseMatch, status: 'cancelled' }, now)).not.toBeNull();
    expect(noShowMarkRefusal({ ...baseMatch, status: 'open-signups' }, now)).not.toBeNull();
  });

  it('spots the posting that crosses below zero', () => {
    expect(wentIntoDebt({ amount: -50, balanceAfter: -10 })).toBe(true);
    expect(wentIntoDebt({ amount: -50, balanceAfter: -60 })).toBe(false);
    expect(wentIntoDebt({ amount: -50, balanceAfter: 0 })).toBe(false);
  });

  it('formats money with the currency symbol', () => {
    expect(formatMoney(1250, '$')).toBe('$1,250');
    expect(formatMoney(-30, '$')).toBe('-$30');
  });
});
