import { describe, it, expect } from 'vitest';
import { MAX_MOVES } from '../../types';
import { compactMoves, displayMoveName, movesEqual, padMoves } from '../movesets';

describe('padMoves', () => {
  it('always returns MAX_MOVES rows', () => {
    expect(padMoves(undefined)).toHaveLength(MAX_MOVES);
    expect(padMoves([{ gameName: 'a', customName: '' }])).toHaveLength(MAX_MOVES);
    expect(padMoves([{ gameName: 'a', customName: '' }])[0]).toEqual({ gameName: 'a', customName: '' });
  });

  it('truncates anything beyond MAX_MOVES', () => {
    const many = Array.from({ length: MAX_MOVES + 2 }, (_, i) => ({ gameName: `m${i}`, customName: '' }));
    expect(padMoves(many)).toHaveLength(MAX_MOVES);
  });
});

describe('compactMoves', () => {
  it('trims and drops blank game names', () => {
    expect(
      compactMoves([
        { gameName: ' a ', customName: ' A ' },
        { gameName: '  ', customName: 'orphan' },
        { gameName: 'b', customName: '' },
      ]),
    ).toEqual([
      { gameName: 'a', customName: 'A' },
      { gameName: 'b', customName: '' },
    ]);
  });
});

describe('displayMoveName', () => {
  it('prefers the custom name, falls back to the in-game name', () => {
    expect(displayMoveName({ gameName: 'Cody Cutter', customName: 'The Cutter' })).toBe('The Cutter');
    expect(displayMoveName({ gameName: 'Cody Cutter', customName: '  ' })).toBe('Cody Cutter');
  });
});

describe('movesEqual', () => {
  it('ignores padding and whitespace', () => {
    const stored = [{ gameName: 'a', customName: 'A' }];
    expect(movesEqual(padMoves(stored), stored)).toBe(true);
    expect(movesEqual([{ gameName: ' a ', customName: 'A ' }], stored)).toBe(true);
    expect(movesEqual(undefined, [])).toBe(true);
  });

  it('detects real changes', () => {
    const stored = [{ gameName: 'a', customName: 'A' }];
    expect(movesEqual([{ gameName: 'a', customName: 'B' }], stored)).toBe(false);
    expect(movesEqual([...stored, { gameName: 'b', customName: '' }], stored)).toBe(false);
  });
});
