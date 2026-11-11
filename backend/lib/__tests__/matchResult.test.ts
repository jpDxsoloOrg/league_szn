import { describe, it, expect } from 'vitest';
import { matchWinners } from '../matchResult';
import { computeHeadToHead, pairWinnerId, type HeadToHeadMatch } from '../headToHead';

const stored = (overrides: Partial<HeadToHeadMatch>): HeadToHeadMatch => ({
  matchId: 'm',
  date: '2026-01-01',
  participants: ['a', 'b'],
  ...overrides,
});

describe('matchWinners', () => {
  it('returns nobody for a draw, even though winners holds the participants', () => {
    expect(matchWinners({ winners: ['a', 'b'], isDraw: true })).toEqual([]);
  });

  it('returns the stored winners otherwise', () => {
    expect(matchWinners({ winners: ['a'] })).toEqual(['a']);
    expect(matchWinners({})).toEqual([]);
  });
});

describe('pairWinnerId', () => {
  it('names the winner whichever way round the pair is passed', () => {
    const match = stored({ winners: ['b'] });
    expect(pairWinnerId(match, 'a', 'b')).toBe('b');
    expect(pairWinnerId(match, 'b', 'a')).toBe('b');
  });

  it.each([
    ['a draw', stored({ winners: ['a', 'b'], isDraw: true })],
    ['a third wrestler winning', stored({ participants: ['a', 'b', 'c'], winners: ['c'] })],
    ['partners winning together', stored({ participants: ['a', 'b', 'c'], winners: ['b', 'a'] })],
  ])('leaves the pair level on %s', (_label, match) => {
    expect(pairWinnerId(match, 'a', 'b')).toBeUndefined();
    expect(pairWinnerId(match, 'b', 'a')).toBeUndefined();
  });
});

describe('computeHeadToHead', () => {
  const matches = [
    stored({ matchId: 'win', date: '2026-01-01', winners: ['a'] }),
    stored({ matchId: 'draw', date: '2026-01-02', winners: ['a', 'b'], isDraw: true }),
    stored({ matchId: 'other-win', date: '2026-01-03', participants: ['a', 'b', 'c'], winners: ['c'] }),
    stored({ matchId: 'partners', date: '2026-01-04', participants: ['a', 'b', 'c'], winners: ['b', 'a'] }),
  ];

  it('gives the same record whichever way round the pair is passed', () => {
    const forward = computeHeadToHead(matches, 'a', 'b');
    const reverse = computeHeadToHead(matches, 'b', 'a');

    expect(forward).toMatchObject({ player1Wins: 1, player2Wins: 0, draws: 3, totalMatches: 4 });
    expect(reverse).toMatchObject({ player1Wins: 0, player2Wins: 1, draws: 3, totalMatches: 4 });
  });

  it('reports no last winner when the latest shared match left the pair level', () => {
    expect(computeHeadToHead(matches, 'a', 'b').lastWinnerId).toBeUndefined();
    expect(computeHeadToHead(matches.slice(0, 1), 'b', 'a').lastWinnerId).toBe('a');
  });
});
