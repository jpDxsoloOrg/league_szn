import { describe, it, expect } from 'vitest';
import { computeRecentFormAndStreak, type CompletedMatchForForm } from '../recentForm';

const PLAYER = 'p1';

function matchOn(day: number, result: 'W' | 'L' | 'D'): CompletedMatchForForm {
  return {
    participants: [PLAYER, 'p2'],
    winners: result === 'W' ? [PLAYER] : result === 'L' ? ['p2'] : [],
    losers: result === 'L' ? [PLAYER] : result === 'W' ? ['p2'] : [],
    isDraw: result === 'D',
    updatedAt: new Date(Date.UTC(2026, 0, day)).toISOString(),
  };
}

describe('computeRecentFormAndStreak', () => {
  it('reports a streak longer than the form window', () => {
    const matches = Array.from({ length: 12 }, (_unused, index) => matchOn(index + 1, 'W'));

    const { recentForm, currentStreak } = computeRecentFormAndStreak(PLAYER, matches);

    expect(recentForm).toEqual(['W', 'W', 'W', 'W', 'W']);
    expect(currentStreak).toEqual({ type: 'W', count: 12 });
  });

  it('stops the streak at the most recent change, whatever the input order', () => {
    const matches = [matchOn(3, 'L'), matchOn(1, 'W'), matchOn(4, 'L'), matchOn(2, 'W')];

    const { recentForm, currentStreak } = computeRecentFormAndStreak(PLAYER, matches);

    expect(recentForm).toEqual(['L', 'L', 'W', 'W']);
    expect(currentStreak).toEqual({ type: 'L', count: 2 });
  });

  it('leaves out matches with no updatedAt and matches the player was not in', () => {
    const matches = [
      matchOn(1, 'W'),
      { ...matchOn(2, 'L'), updatedAt: undefined },
      { ...matchOn(3, 'L'), participants: ['p2', 'p3'] },
    ];

    expect(computeRecentFormAndStreak(PLAYER, matches)).toEqual({
      recentForm: ['W'],
      currentStreak: { type: 'W', count: 1 },
    });
  });

  it('returns an empty form with a zero streak for a player with no matches', () => {
    expect(computeRecentFormAndStreak(PLAYER, [])).toEqual({
      recentForm: [],
      currentStreak: { type: 'W', count: 0 },
    });
  });
});
