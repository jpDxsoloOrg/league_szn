import { describe, it, expect } from 'vitest';
import type { Division, Match } from '../repositories/types';
import type { DivisionLadderRules } from '../repositories/SiteConfigRepository';
import {
  sortDivisionsByRank,
  getAdjacentDivision,
  computeLadderStreak,
  evaluateLadderMove,
} from '../divisionLadder';

function makeDivision(divisionId: string, rank: number | undefined, createdAt: string): Division {
  return {
    divisionId,
    name: divisionId,
    createdAt,
    updatedAt: createdAt,
    ...(rank === undefined ? {} : { rank }),
  };
}

const jobber = makeDivision('jobber', 0, '2026-01-01T00:00:00.000Z');
const midcard = makeDivision('midcard', 1, '2026-01-02T00:00:00.000Z');
const mainEvent = makeDivision('main-event', 2, '2026-01-03T00:00:00.000Z');
const unrankedOld = makeDivision('unranked-old', undefined, '2025-12-01T00:00:00.000Z');
const unrankedNew = makeDivision('unranked-new', undefined, '2026-02-01T00:00:00.000Z');

const ladder: Division[] = [mainEvent, unrankedNew, jobber, unrankedOld, midcard];

const rules: DivisionLadderRules = { enabled: true, promoteWinStreak: 5, demoteLossStreak: 5 };

let matchCounter = 0;

function makeMatch(
  date: string,
  result: 'W' | 'L' | 'D',
  playerId = 'p1',
  overrides: Partial<Match> = {},
): Match {
  matchCounter++;
  const opponent = 'p2';
  const base: Match = {
    matchId: `m${matchCounter}`,
    date,
    participants: [playerId, opponent],
    status: 'completed',
    createdAt: date,
    updatedAt: date,
  };
  if (result === 'W') return { ...base, winners: [playerId], losers: [opponent], ...overrides };
  if (result === 'L') return { ...base, winners: [opponent], losers: [playerId], ...overrides };
  return { ...base, isDraw: true, ...overrides };
}

function streakOf(results: Array<'W' | 'L' | 'D'>, startDay = 1): Match[] {
  // Oldest first in the array; dates ascend so newest = last entry.
  return results.map((result, index) =>
    makeMatch(`2026-03-${String(startDay + index).padStart(2, '0')}T20:00:00.000Z`, result),
  );
}

describe('sortDivisionsByRank', () => {
  it('orders ranked divisions ascending by rank, then unranked by createdAt', () => {
    expect(sortDivisionsByRank(ladder).map((d) => d.divisionId)).toEqual([
      'jobber',
      'midcard',
      'main-event',
      'unranked-old',
      'unranked-new',
    ]);
  });

  it('does not mutate the input', () => {
    const input = [...ladder];
    sortDivisionsByRank(input);
    expect(input.map((d) => d.divisionId)).toEqual(ladder.map((d) => d.divisionId));
  });

  it('tolerates gaps in rank values', () => {
    const gappy = [makeDivision('a', 7, '2026-01-01'), makeDivision('b', 2, '2026-01-02')];
    expect(sortDivisionsByRank(gappy).map((d) => d.divisionId)).toEqual(['b', 'a']);
  });
});

describe('getAdjacentDivision', () => {
  it('returns the next higher division for "up"', () => {
    expect(getAdjacentDivision(ladder, 'jobber', 'up')?.divisionId).toBe('midcard');
    expect(getAdjacentDivision(ladder, 'midcard', 'up')?.divisionId).toBe('main-event');
  });

  it('returns the next lower division for "down"', () => {
    expect(getAdjacentDivision(ladder, 'main-event', 'down')?.divisionId).toBe('midcard');
    expect(getAdjacentDivision(ladder, 'midcard', 'down')?.divisionId).toBe('jobber');
  });

  it('returns null at the top and bottom', () => {
    expect(getAdjacentDivision(ladder, 'main-event', 'up')).toBeNull();
    expect(getAdjacentDivision(ladder, 'jobber', 'down')).toBeNull();
  });

  it('returns null for unranked or unknown divisions', () => {
    expect(getAdjacentDivision(ladder, 'unranked-old', 'up')).toBeNull();
    expect(getAdjacentDivision(ladder, 'unranked-old', 'down')).toBeNull();
    expect(getAdjacentDivision(ladder, 'nope', 'up')).toBeNull();
  });

  it('skips unranked divisions when walking the ladder', () => {
    // Unranked divisions sit after the ranked ones; they must never be a neighbour.
    expect(getAdjacentDivision([mainEvent, unrankedNew], 'main-event', 'up')).toBeNull();
  });

  it('returns null both ways when only one ranked division exists', () => {
    expect(getAdjacentDivision([jobber, unrankedOld], 'jobber', 'up')).toBeNull();
    expect(getAdjacentDivision([jobber, unrankedOld], 'jobber', 'down')).toBeNull();
  });
});

describe('computeLadderStreak', () => {
  it('returns a zero win streak for no matches', () => {
    expect(computeLadderStreak('p1', [])).toEqual({ type: 'W', count: 0 });
  });

  it('counts consecutive results from the newest match', () => {
    expect(computeLadderStreak('p1', streakOf(['L', 'W', 'W', 'W']))).toEqual({ type: 'W', count: 3 });
    expect(computeLadderStreak('p1', streakOf(['W', 'W', 'L', 'L']))).toEqual({ type: 'L', count: 2 });
    expect(computeLadderStreak('p1', streakOf(['W', 'D']))).toEqual({ type: 'D', count: 1 });
  });

  it('sorts by date regardless of input order', () => {
    const matches = streakOf(['L', 'W', 'W']).reverse();
    expect(computeLadderStreak('p1', matches)).toEqual({ type: 'W', count: 2 });
  });

  it('ignores matches the player was not in', () => {
    const matches = [
      ...streakOf(['W', 'W']),
      makeMatch('2026-03-10T20:00:00.000Z', 'L', 'someone-else'),
    ];
    expect(computeLadderStreak('p1', matches)).toEqual({ type: 'W', count: 2 });
  });

  it('counts slot-based participants', () => {
    const match = makeMatch('2026-03-01T20:00:00.000Z', 'W', 'p9', {
      participants: [],
      slots: [
        { slotId: 's1', position: 0, playerId: 'p1' },
        { slotId: 's2', position: 1, playerId: 'p2' },
      ],
      winners: ['p1'],
      losers: ['p2'],
    });
    expect(computeLadderStreak('p1', [match])).toEqual({ type: 'W', count: 1 });
  });

  it('ignores matches that are not completed', () => {
    const matches = [
      ...streakOf(['W', 'W']),
      makeMatch('2026-03-10T20:00:00.000Z', 'L', 'p1', { status: 'scheduled' }),
    ];
    expect(computeLadderStreak('p1', matches)).toEqual({ type: 'W', count: 2 });
  });

  it('treats a participant absent from winners and losers as a draw', () => {
    const match = makeMatch('2026-03-01T20:00:00.000Z', 'W', 'p1', {
      participants: ['p1', 'p2', 'p3'],
      winners: ['p2'],
      losers: ['p3'],
    });
    expect(computeLadderStreak('p1', [match])).toEqual({ type: 'D', count: 1 });
  });

  it('only counts matches dated strictly after `since`', () => {
    // Five wins before the move, then two after it.
    const before = streakOf(['W', 'W', 'W', 'W', 'W'], 1); // 03-01 .. 03-05
    const movedAt = '2026-03-05T21:00:00.000Z';
    const after = streakOf(['W', 'W'], 10); // 03-10, 03-11
    expect(computeLadderStreak('p1', [...before, ...after], movedAt)).toEqual({ type: 'W', count: 2 });
    expect(computeLadderStreak('p1', [...before, ...after])).toEqual({ type: 'W', count: 7 });
  });

  it('excludes a match dated exactly at `since`', () => {
    const match = makeMatch('2026-03-05T20:00:00.000Z', 'W');
    expect(computeLadderStreak('p1', [match], '2026-03-05T20:00:00.000Z')).toEqual({ type: 'W', count: 0 });
  });
});

describe('evaluateLadderMove', () => {
  const midcardPlayer = { playerId: 'p1', divisionId: 'midcard' };

  it('promotes at exactly the win threshold', () => {
    expect(
      evaluateLadderMove({ player: midcardPlayer, streak: { type: 'W', count: 5 }, rules, divisions: ladder }),
    ).toEqual({ direction: 'promoted', fromDivisionId: 'midcard', toDivisionId: 'main-event' });
  });

  it('promotes above the threshold too', () => {
    expect(
      evaluateLadderMove({ player: midcardPlayer, streak: { type: 'W', count: 9 }, rules, divisions: ladder }),
    ).toEqual({ direction: 'promoted', fromDivisionId: 'midcard', toDivisionId: 'main-event' });
  });

  it('demotes at exactly the loss threshold', () => {
    expect(
      evaluateLadderMove({ player: midcardPlayer, streak: { type: 'L', count: 5 }, rules, divisions: ladder }),
    ).toEqual({ direction: 'demoted', fromDivisionId: 'midcard', toDivisionId: 'jobber' });
  });

  it('does nothing below the threshold', () => {
    expect(
      evaluateLadderMove({ player: midcardPlayer, streak: { type: 'W', count: 4 }, rules, divisions: ladder }),
    ).toBeNull();
    expect(
      evaluateLadderMove({ player: midcardPlayer, streak: { type: 'L', count: 4 }, rules, divisions: ladder }),
    ).toBeNull();
  });

  it('honours custom thresholds', () => {
    const custom: DivisionLadderRules = { enabled: true, promoteWinStreak: 3, demoteLossStreak: 2 };
    expect(
      evaluateLadderMove({ player: midcardPlayer, streak: { type: 'W', count: 3 }, rules: custom, divisions: ladder }),
    ).toMatchObject({ direction: 'promoted' });
    expect(
      evaluateLadderMove({ player: midcardPlayer, streak: { type: 'L', count: 2 }, rules: custom, divisions: ladder }),
    ).toMatchObject({ direction: 'demoted' });
  });

  it('never demotes below the bottom division', () => {
    expect(
      evaluateLadderMove({
        player: { playerId: 'p1', divisionId: 'jobber' },
        streak: { type: 'L', count: 12 },
        rules,
        divisions: ladder,
      }),
    ).toBeNull();
  });

  it('never promotes above the top division', () => {
    expect(
      evaluateLadderMove({
        player: { playerId: 'p1', divisionId: 'main-event' },
        streak: { type: 'W', count: 12 },
        rules,
        divisions: ladder,
      }),
    ).toBeNull();
  });

  it('does nothing for a player in an unranked division', () => {
    expect(
      evaluateLadderMove({
        player: { playerId: 'p1', divisionId: 'unranked-old' },
        streak: { type: 'W', count: 12 },
        rules,
        divisions: ladder,
      }),
    ).toBeNull();
  });

  it('does nothing for a player with no division or an unknown division', () => {
    expect(
      evaluateLadderMove({ player: { playerId: 'p1' }, streak: { type: 'W', count: 12 }, rules, divisions: ladder }),
    ).toBeNull();
    expect(
      evaluateLadderMove({
        player: { playerId: 'p1', divisionId: 'ghost' },
        streak: { type: 'W', count: 12 },
        rules,
        divisions: ladder,
      }),
    ).toBeNull();
  });

  it('does nothing when the rules are disabled', () => {
    expect(
      evaluateLadderMove({
        player: midcardPlayer,
        streak: { type: 'W', count: 12 },
        rules: { ...rules, enabled: false },
        divisions: ladder,
      }),
    ).toBeNull();
  });

  it('never moves on a draw streak', () => {
    expect(
      evaluateLadderMove({ player: midcardPlayer, streak: { type: 'D', count: 12 }, rules, divisions: ladder }),
    ).toBeNull();
  });

  it('ignores an empty streak', () => {
    const zeroThreshold: DivisionLadderRules = { enabled: true, promoteWinStreak: 0, demoteLossStreak: 0 };
    expect(
      evaluateLadderMove({ player: midcardPlayer, streak: { type: 'W', count: 0 }, rules: zeroThreshold, divisions: ladder }),
    ).toBeNull();
  });

  it('composes with computeLadderStreak using the since cut-off', () => {
    const before = streakOf(['W', 'W', 'W', 'W', 'W'], 1);
    const after = streakOf(['W', 'W', 'W', 'W'], 10);
    const movedAt = '2026-03-05T21:00:00.000Z';

    const streak = computeLadderStreak('p1', [...before, ...after], movedAt);
    expect(evaluateLadderMove({ player: midcardPlayer, streak, rules, divisions: ladder })).toBeNull();

    const fifth = makeMatch('2026-03-14T20:00:00.000Z', 'W');
    const streakAfterFifth = computeLadderStreak('p1', [...before, ...after, fifth], movedAt);
    expect(evaluateLadderMove({ player: midcardPlayer, streak: streakAfterFifth, rules, divisions: ladder })).toEqual({
      direction: 'promoted',
      fromDivisionId: 'midcard',
      toDivisionId: 'main-event',
    });
  });
});
