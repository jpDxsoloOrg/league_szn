import { describe, expect, it } from 'vitest';
import type { MatchCardEntry, MatchDesignation } from '../../../types/event';
import { findMoveTarget, swapCards } from '../cardOrder';

const cards = (...designations: MatchDesignation[]): MatchCardEntry[] =>
  designations.map((designation, index) => ({ position: index + 1, matchId: `m${index + 1}`, designation }));

describe('findMoveTarget', () => {
  it('treats every non pre-show designation as one section', () => {
    const card = cards('opener', 'main-event', 'midcard');
    expect(findMoveTarget(card, 2, 'up')).toBe(1);
    expect(findMoveTarget(card, 0, 'down')).toBe(1);
  });

  it('skips entries from the other section', () => {
    const card = cards('pre-show', 'midcard', 'midcard', 'pre-show');
    expect(findMoveTarget(card, 3, 'up')).toBe(0);
    expect(findMoveTarget(card, 0, 'down')).toBe(3);
  });

  it('returns null at the end of a section or for an unknown index', () => {
    const card = cards('pre-show', 'midcard');
    expect(findMoveTarget(card, 0, 'up')).toBeNull();
    expect(findMoveTarget(card, 0, 'down')).toBeNull();
    expect(findMoveTarget(card, 1, 'up')).toBeNull();
    expect(findMoveTarget(card, 5, 'up')).toBeNull();
  });
});

describe('swapCards', () => {
  it('swaps entries, renumbers gaps and duplicates, and keeps other fields', () => {
    const source: MatchCardEntry[] = [
      { position: 1, matchId: 'a', designation: 'opener', notes: 'Keep me' },
      { position: 3, matchId: 'b', designation: 'midcard' },
      { position: 3, matchId: 'c', designation: 'main-event' },
    ];

    expect(swapCards(source, 0, 1)).toEqual([
      { position: 1, matchId: 'b', designation: 'midcard' },
      { position: 2, matchId: 'a', designation: 'opener', notes: 'Keep me' },
      { position: 3, matchId: 'c', designation: 'main-event' },
    ]);
    expect(source[0]?.matchId).toBe('a');
  });
});
