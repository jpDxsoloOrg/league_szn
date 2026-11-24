import { describe, it, expect } from 'vitest';
import {
  POINTS_WIN,
  POINTS_DRAW,
  POINTS_LOSS,
  QUALITY_WIN_BONUS,
  STREAK_BONUS,
  STREAK_BONUS_EVERY,
  compareLeagueRows,
  computeLeagueTable,
  headToHeadWithinGroup,
  rankLeagueTable,
  type LeagueMatchInput,
  type LeagueRow,
} from '../leaguePoints';

let matchCounter = 0;

/** A decided match on day `day` (so replay order follows `day`). */
function win(
  day: number,
  winners: string[],
  losers: string[],
  extra: Partial<LeagueMatchInput> = {},
): LeagueMatchInput {
  matchCounter += 1;
  return {
    matchId: `m${String(matchCounter).padStart(3, '0')}`,
    date: `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`,
    participants: [...winners, ...losers],
    winners,
    losers,
    ...extra,
  };
}

/** A draw; like recordResult, `winners` holds every participant. */
function draw(day: number, participants: string[], extra: Partial<LeagueMatchInput> = {}): LeagueMatchInput {
  return win(day, participants, [], { isDraw: true, participants, ...extra });
}

function rowOf(rows: readonly LeagueRow[], playerId: string): LeagueRow {
  const row = rows.find((candidate) => candidate.playerId === playerId);
  if (!row) throw new Error(`no row for ${playerId}`);
  return row;
}

function row(overrides: Partial<LeagueRow> & { playerId: string }): LeagueRow {
  return {
    points: 0,
    basePoints: 0,
    qualityWins: 0,
    streakBonuses: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    matchesPlayed: 1,
    winPct: 0,
    sos: 0,
    headToHead: [],
    ...overrides,
  };
}

/** Deterministic Fisher-Yates so the shuffle test is reproducible. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const swapWith = state % (index + 1);
    [copy[index], copy[swapWith]] = [copy[swapWith], copy[index]];
  }
  return copy;
}

describe('tunables', () => {
  it('match the ticket', () => {
    expect([POINTS_WIN, POINTS_DRAW, POINTS_LOSS]).toEqual([3, 1, 0]);
    expect([QUALITY_WIN_BONUS, STREAK_BONUS, STREAK_BONUS_EVERY]).toEqual([1, 1, 3]);
  });
});

describe('computeLeagueTable: result points', () => {
  it('returns an empty table for no matches', () => {
    expect(computeLeagueTable([])).toEqual([]);
  });

  it('gives 3 for a win and 0 for a loss', () => {
    const rows = computeLeagueTable([win(1, ['a'], ['b'])]);
    expect(rowOf(rows, 'a')).toMatchObject({ points: 3, basePoints: 3, wins: 1, matchesPlayed: 1, winPct: 1 });
    expect(rowOf(rows, 'b')).toMatchObject({ points: 0, basePoints: 0, losses: 1, matchesPlayed: 1, winPct: 0 });
  });

  it('gives 1 to each of 3 participants on a triple-threat draw', () => {
    const rows = computeLeagueTable([draw(1, ['a', 'b', 'c'])]);
    for (const playerId of ['a', 'b', 'c']) {
      expect(rowOf(rows, playerId)).toMatchObject({ points: 1, draws: 1, wins: 0, losses: 0 });
    }
  });

  it('reads draw players from participants even if winners is empty', () => {
    const rows = computeLeagueTable([draw(1, ['a', 'b'], { winners: [] })]);
    expect(rows.map((entry) => entry.points)).toEqual([1, 1]);
  });

  it('gives a 4-way winner 3 points, not 9', () => {
    const rows = computeLeagueTable([win(1, ['a'], ['b', 'c', 'd'])]);
    expect(rowOf(rows, 'a').basePoints).toBe(3);
    expect(rowOf(rows, 'a').qualityWins).toBe(0);
  });

  it('skips matches with no winner that are not draws', () => {
    expect(computeLeagueTable([win(1, [], ['a', 'b'])])).toEqual([]);
  });

  it('ignores a player listed as both winner and loser on the losing side', () => {
    const rows = computeLeagueTable([win(1, ['a'], ['a', 'b'])]);
    expect(rowOf(rows, 'a')).toMatchObject({ wins: 1, losses: 0 });
  });

  it('adds rows for listed players without matches', () => {
    const rows = computeLeagueTable([win(1, ['a'], ['b'])], { playerIds: ['z'] });
    expect(rowOf(rows, 'z')).toMatchObject({ points: 0, matchesPlayed: 0, winPct: 0, sos: 0 });
  });
});

describe('computeLeagueTable: quality wins', () => {
  it('gives +1 for beating a player with more points before the match', () => {
    const rows = computeLeagueTable([win(1, ['b'], ['c']), win(2, ['a'], ['b'])]);
    expect(rowOf(rows, 'a')).toMatchObject({ qualityWins: 1, points: 4, basePoints: 3 });
  });

  it('gives nothing for beating a player with equal points', () => {
    const rows = computeLeagueTable([win(1, ['a'], ['b'])]);
    expect(rowOf(rows, 'a').qualityWins).toBe(0);
  });

  it('gives nothing once you have passed them', () => {
    // b wins once (3). a wins twice (3, then 4 with the quality win over b).
    // Beating b again on day 4: a has 7 > b's 3, so no bonus.
    const rows = computeLeagueTable([
      win(1, ['b'], ['c']),
      win(2, ['a'], ['b']),
      win(3, ['a'], ['d']),
      win(4, ['a'], ['b']),
    ]);
    const playerA = rowOf(rows, 'a');
    expect(playerA.qualityWins).toBe(1);
    expect(playerA.streakBonuses).toBe(1);
    expect(playerA.points).toBe(9 + 1 + 1);
  });

  it('judges on points before the match, not the final table', () => {
    // a beats b while b leads; b later slumps far below a. Still a quality win.
    const rows = computeLeagueTable([
      win(1, ['b'], ['c']),
      win(2, ['a'], ['b']),
      win(3, ['c'], ['b']),
    ]);
    expect(rowOf(rows, 'a').qualityWins).toBe(1);
  });

  it('gives +1 for beating a reigning champion', () => {
    const calls: Array<[string, string]> = [];
    const isChampionAt = (playerId: string, at: string): boolean => {
      calls.push([playerId, at]);
      return playerId === 'champ';
    };
    const rows = computeLeagueTable([win(1, ['a'], ['champ'])], { isChampionAt });
    expect(rowOf(rows, 'a').qualityWins).toBe(1);
    expect(calls).toEqual([['champ', '2026-01-01T00:00:00.000Z']]);
  });

  it('asks isChampionAt about the result time when completedAt is set', () => {
    const seen: string[] = [];
    computeLeagueTable([win(1, ['a'], ['b'], { completedAt: '2026-02-01T00:00:00.000Z' })], {
      isChampionAt: (_playerId, at) => {
        seen.push(at);
        return false;
      },
    });
    expect(seen).toEqual(['2026-02-01T00:00:00.000Z']);
  });

  it('gives only +1 when the loser is both ahead and champion', () => {
    const rows = computeLeagueTable([win(1, ['champ'], ['c']), win(2, ['a'], ['champ'])], {
      isChampionAt: (playerId) => playerId === 'champ',
    });
    expect(rowOf(rows, 'a')).toMatchObject({ qualityWins: 1, points: 4 });
  });

  it('judges each tag partner independently', () => {
    // a has 3 points, b has 0. Losers c and d have 3 each.
    // b (0) is below them: bonus. a (3) is not strictly below: no bonus.
    const rows = computeLeagueTable([
      win(1, ['a'], ['x']),
      win(2, ['c'], ['y']),
      win(3, ['d'], ['z']),
      win(4, ['a', 'b'], ['c', 'd'], { teams: [['a', 'b'], ['c', 'd']] }),
    ]);
    expect(rowOf(rows, 'b').qualityWins).toBe(1);
    expect(rowOf(rows, 'a').qualityWins).toBe(0);
  });

  it('gives both partners the bonus when both trail', () => {
    const rows = computeLeagueTable([
      win(1, ['c'], ['y']),
      win(2, ['a', 'b'], ['c', 'd']),
    ]);
    expect(rowOf(rows, 'a').qualityWins).toBe(1);
    expect(rowOf(rows, 'b').qualityWins).toBe(1);
  });
});

describe('computeLeagueTable: streaks', () => {
  it('W W W gives +1', () => {
    const rows = computeLeagueTable([win(1, ['a'], ['b']), win(2, ['a'], ['c']), win(3, ['a'], ['d'])]);
    expect(rowOf(rows, 'a')).toMatchObject({ streakBonuses: 1, points: 10 });
  });

  it('six straight wins give +2', () => {
    const matches = [1, 2, 3, 4, 5, 6].map((day) => win(day, ['a'], [`o${day}`]));
    expect(rowOf(computeLeagueTable(matches), 'a').streakBonuses).toBe(2);
  });

  it('W W D W gives 0 (a draw resets)', () => {
    const rows = computeLeagueTable([
      win(1, ['a'], ['b']),
      win(2, ['a'], ['c']),
      draw(3, ['a', 'd']),
      win(4, ['a'], ['e']),
    ]);
    expect(rowOf(rows, 'a').streakBonuses).toBe(0);
  });

  it('W W L W gives 0 (a loss resets)', () => {
    const rows = computeLeagueTable([
      win(1, ['a'], ['b']),
      win(2, ['a'], ['c']),
      win(3, ['d'], ['a']),
      win(4, ['a'], ['e']),
    ]);
    expect(rowOf(rows, 'a').streakBonuses).toBe(0);
  });
});

describe('computeLeagueTable: ordering', () => {
  it('replays by completedAt, then date, then matchId', () => {
    // Booked first but recorded last: the c-vs-b result happens before a-vs-b,
    // so a beats a b who has 0 points and gets no quality win. If booking date
    // were used instead, b would have 3 points first and a would get the bonus.
    const rows = computeLeagueTable([
      win(1, ['b'], ['c'], { completedAt: '2026-01-09T00:00:00.000Z' }),
      win(2, ['a'], ['b']),
    ]);
    expect(rowOf(rows, 'a').qualityWins).toBe(0);
  });

  it('breaks equal times on matchId', () => {
    const date = '2026-01-01T00:00:00.000Z';
    const first = { ...win(1, ['b'], ['c']), matchId: 'aaa', date };
    const second = { ...win(1, ['a'], ['b']), matchId: 'bbb', date };
    for (const order of [[first, second], [second, first]]) {
      expect(rowOf(computeLeagueTable(order), 'a').qualityWins).toBe(1);
    }
  });

  it('gives the same output whatever the input order', () => {
    const matches = [
      win(1, ['a'], ['b']),
      win(2, ['b'], ['c']),
      win(3, ['c'], ['a']),
      draw(4, ['a', 'b', 'c']),
      win(5, ['a', 'b'], ['c', 'd'], { teams: [['a', 'b'], ['c', 'd']] }),
      win(6, ['d'], ['a']),
      win(7, ['b'], ['d']),
      win(8, ['b'], ['a']),
      win(9, ['b'], ['c']),
    ];
    const expected = rankLeagueTable(computeLeagueTable(matches));
    for (const seed of [1, 7, 42, 1234]) {
      const actual = rankLeagueTable(computeLeagueTable(shuffled(matches, seed)));
      expect(actual).toEqual(expected);
    }
  });
});

describe('computeLeagueTable: opponents and SOS', () => {
  it('treats tag partners as teammates, not opponents', () => {
    const rows = computeLeagueTable([
      win(1, ['a', 'b'], ['c', 'd'], { teams: [['a', 'b'], ['c', 'd']] }),
    ]);
    expect(rowOf(rows, 'a').headToHead[0].opponentIds).toEqual(['c', 'd']);
    expect(rowOf(rows, 'c').headToHead[0].opponentIds).toEqual(['a', 'b']);
  });

  it('reads several winners without teams as winners vs losers', () => {
    const rows = computeLeagueTable([win(1, ['a', 'b'], ['c', 'd'])]);
    expect(rowOf(rows, 'd').headToHead[0].opponentIds).toEqual(['a', 'b']);
  });

  it('treats a multi-man match as every man for himself', () => {
    const rows = computeLeagueTable([win(1, ['a'], ['b', 'c'])]);
    expect(rowOf(rows, 'b').headToHead[0].opponentIds).toEqual(['a', 'c']);
  });

  it('ignores empty teams and treats a player missing from teams as solo', () => {
    const emptyTeams = computeLeagueTable([win(1, ['a'], ['b', 'c'], { teams: [] })]);
    expect(rowOf(emptyTeams, 'b').headToHead[0].opponentIds).toEqual(['a', 'c']);
    const partialTeams = computeLeagueTable([win(1, ['a'], ['b', 'c'], { teams: [['b', 'c']] })]);
    expect(rowOf(partialTeams, 'a').headToHead[0].opponentIds).toEqual(['b', 'c']);
    expect(rowOf(partialTeams, 'b').headToHead[0].opponentIds).toEqual(['a']);
  });

  it('averages opponents\' final points per match, with repeats', () => {
    // b: 1 win, 2 losses -> 3 pts / 3 = 1. c: 1 loss -> 0.
    // a faced b twice and c once: (1 + 1 + 0) / 3 = 0.667.
    const rows = computeLeagueTable([
      win(1, ['a'], ['b']),
      win(2, ['a'], ['b']),
      win(3, ['b'], ['d']),
      win(4, ['a'], ['c']),
    ]);
    expect(rowOf(rows, 'a').sos).toBe(0.667);
    expect(rowOf(rows, 'a').winPct).toBe(1);
  });

  it('ranks the tougher schedule higher on equal points', () => {
    const rows = computeLeagueTable([
      // strong goes 2-0 against s1 and s2 elsewhere.
      win(1, ['strong'], ['s1']),
      win(2, ['strong'], ['s2']),
      // a and b each go 1-1. a loses to strong (who has 6 pts), b to weak.
      win(3, ['strong2'], ['weak']),
      win(4, ['weak'], ['b']),
      win(5, ['a'], ['p']),
      win(6, ['b'], ['q']),
      win(7, ['strong'], ['a']),
    ]);
    const ranked = rankLeagueTable(rows);
    const rankA = ranked.findIndex((entry) => entry.playerId === 'a');
    const rankB = ranked.findIndex((entry) => entry.playerId === 'b');
    expect(rowOf(rows, 'a').points).toBe(rowOf(rows, 'b').points);
    expect(rowOf(rows, 'a').sos).toBeGreaterThan(rowOf(rows, 'b').sos);
    expect(rankA).toBeLessThan(rankB);
  });
});

describe('headToHeadWithinGroup', () => {
  it('counts only matches against members of the group', () => {
    const rows = computeLeagueTable([
      win(1, ['a'], ['b']),
      win(2, ['a'], ['outsider']),
      win(3, ['c'], ['a']),
    ]);
    const totals = headToHeadWithinGroup([rowOf(rows, 'a'), rowOf(rows, 'b')]);
    expect(totals.get('a')).toBe(3);
    expect(totals.get('b')).toBe(0);
  });
});

describe('compareLeagueRows', () => {
  it('sorts by points desc first', () => {
    expect(compareLeagueRows(row({ playerId: 'a', points: 5 }), row({ playerId: 'b', points: 3 }))).toBeLessThan(0);
  });

  it('then by sos desc', () => {
    expect(compareLeagueRows(row({ playerId: 'a', sos: 1 }), row({ playerId: 'b', sos: 2 }))).toBeGreaterThan(0);
  });

  it('then by head-to-head points from the map', () => {
    const h2h = new Map([['b', 3]]);
    expect(compareLeagueRows(row({ playerId: 'a' }), row({ playerId: 'b' }), h2h)).toBeGreaterThan(0);
  });

  it('then by win % desc, then wins desc', () => {
    expect(
      compareLeagueRows(row({ playerId: 'a', winPct: 0.5 }), row({ playerId: 'b', winPct: 0.25 })),
    ).toBeLessThan(0);
    expect(compareLeagueRows(row({ playerId: 'a', wins: 1 }), row({ playerId: 'b', wins: 2 }))).toBeGreaterThan(0);
  });

  it('then by name asc, falling back to playerId', () => {
    expect(compareLeagueRows(row({ playerId: 'z', name: 'Alpha' }), row({ playerId: 'a', name: 'Beta' }))).toBeLessThan(0);
    expect(compareLeagueRows(row({ playerId: 'b' }), row({ playerId: 'a' }))).toBeGreaterThan(0);
    expect(compareLeagueRows(row({ playerId: 'a' }), row({ playerId: 'a' }))).toBe(0);
  });

  it('puts players with no matches after everyone who has played', () => {
    const unplayed = row({ playerId: 'a', matchesPlayed: 0 });
    const winless = row({ playerId: 'b', losses: 3, matchesPlayed: 3, points: 0 });
    expect(compareLeagueRows(unplayed, winless)).toBeGreaterThan(0);
    expect(compareLeagueRows(winless, unplayed)).toBeLessThan(0);
  });
});

describe('rankLeagueTable', () => {
  it('returns an empty list for no rows', () => {
    expect(rankLeagueTable([])).toEqual([]);
  });

  it('breaks a two-way tie on head-to-head, before win %', () => {
    // Replayed: a beats b, b beats x. Both have 3 points and sos 1.5.
    const rows = computeLeagueTable([win(1, ['a'], ['b']), win(2, ['b'], ['x'])]);
    expect([rowOf(rows, 'a').points, rowOf(rows, 'a').sos]).toEqual([3, 1.5]);
    expect([rowOf(rows, 'b').points, rowOf(rows, 'b').sos]).toEqual([3, 1.5]);
    expect(rankLeagueTable(rows).map((entry) => entry.playerId)).toEqual(['a', 'b', 'x']);

    // b has the better win %, but a won the meeting, so a stays ahead.
    const tied = [
      row({ playerId: 'b', points: 3, sos: 1, winPct: 1, headToHead: [{ matchId: 'x', points: 0, opponentIds: ['a'] }] }),
      row({ playerId: 'a', points: 3, sos: 1, winPct: 0.5, headToHead: [{ matchId: 'x', points: 3, opponentIds: ['b'] }] }),
    ];
    const ranked = rankLeagueTable(tied);
    expect(ranked.map((entry) => [entry.playerId, entry.rank])).toEqual([['a', 1], ['b', 2]]);
  });

  it('uses only games inside the group for a three-way tie', () => {
    // a, b, c each 2-2 with the same sos. Inside the group: a beat b and c,
    // b beat c. Outside the group c beat x twice, a and b lost to y.
    const group = [
      row({
        playerId: 'c',
        points: 6,
        sos: 1,
        headToHead: [
          { matchId: '1', points: 0, opponentIds: ['a'] },
          { matchId: '2', points: 0, opponentIds: ['b'] },
          { matchId: '3', points: 3, opponentIds: ['x'] },
          { matchId: '4', points: 3, opponentIds: ['x'] },
        ],
      }),
      row({
        playerId: 'b',
        points: 6,
        sos: 1,
        headToHead: [
          { matchId: '5', points: 0, opponentIds: ['a'] },
          { matchId: '2', points: 3, opponentIds: ['c'] },
          { matchId: '6', points: 3, opponentIds: ['y'] },
        ],
      }),
      row({
        playerId: 'a',
        points: 6,
        sos: 1,
        headToHead: [
          { matchId: '1', points: 3, opponentIds: ['c'] },
          { matchId: '5', points: 3, opponentIds: ['b'] },
          { matchId: '7', points: 0, opponentIds: ['y'] },
        ],
      }),
      row({ playerId: 'leader', points: 9, sos: 1, headToHead: [{ matchId: '8', points: 3, opponentIds: ['a'] }] }),
    ];
    const ranked = rankLeagueTable(group);
    expect(ranked.map((entry) => entry.playerId)).toEqual(['leader', 'a', 'b', 'c']);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2, 3, 4]);
  });

  it('sorts 0-0-0 players last, after 0-3-0', () => {
    const rows = computeLeagueTable(
      [win(1, ['a'], ['winless']), win(2, ['a'], ['winless']), win(3, ['a'], ['winless'])],
      { playerIds: ['newcomer'] },
    );
    const ranked = rankLeagueTable(rows);
    expect(ranked.map((entry) => entry.playerId)).toEqual(['a', 'winless', 'newcomer']);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it('shares a rank when only the name separates rows', () => {
    const ranked = rankLeagueTable([
      row({ playerId: 'p1', name: 'Zed', points: 3 }),
      row({ playerId: 'p2', name: 'Amy', points: 3 }),
      row({ playerId: 'p3', name: 'Top', points: 6 }),
      row({ playerId: 'p4', name: 'Low', points: 1 }),
    ]);
    expect(ranked.map((entry) => [entry.name, entry.rank])).toEqual([
      ['Top', 1],
      ['Amy', 2],
      ['Zed', 2],
      ['Low', 4],
    ]);
  });

  it('keeps caller fields on the ranked rows', () => {
    const ranked = rankLeagueTable([{ ...row({ playerId: 'a' }), divisionId: 'd1' }]);
    expect(ranked[0]).toMatchObject({ divisionId: 'd1', rank: 1 });
  });
});
