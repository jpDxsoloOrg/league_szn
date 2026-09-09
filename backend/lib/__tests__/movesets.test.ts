import { describe, it, expect } from 'vitest';
import {
  MAX_BIO_LENGTH,
  MAX_MOVE_NAME_LENGTH,
  MAX_MOVES,
  hasMoveset,
  parseBio,
  parseMoveList,
} from '../movesets';

describe('parseMoveList', () => {
  it('rejects non-array input', () => {
    expect(parseMoveList('nope', 'signatures')).toEqual({
      error: 'Field signatures must be an array',
    });
  });

  it('rejects more than MAX_MOVES entries', () => {
    const tooMany = Array.from({ length: MAX_MOVES + 1 }, () => ({ gameName: 'x', customName: '' }));
    expect(parseMoveList(tooMany, 'finishers')).toEqual({
      error: `Field finishers may contain at most ${MAX_MOVES} moves`,
    });
  });

  it('rejects non-object entries and non-string names', () => {
    expect(parseMoveList(['x'], 'signatures')).toHaveProperty('error');
    expect(parseMoveList([{ gameName: 1 }], 'signatures')).toHaveProperty('error');
    expect(parseMoveList([{ gameName: 'a', customName: {} }], 'signatures')).toHaveProperty('error');
  });

  it('rejects names over the length cap', () => {
    const long = 'a'.repeat(MAX_MOVE_NAME_LENGTH + 1);
    expect(parseMoveList([{ gameName: long }], 'signatures')).toHaveProperty('error');
    expect(parseMoveList([{ gameName: 'ok', customName: long }], 'signatures')).toHaveProperty('error');
  });

  it('trims names and drops rows with a blank gameName', () => {
    const result = parseMoveList(
      [
        { gameName: '  Cody Cutter ', customName: ' The Cutter ' },
        { gameName: '   ', customName: 'orphan custom name' },
        { gameName: 'Cross Rhodes' },
        {},
      ],
      'signatures',
    );
    expect(result).toEqual({
      value: [
        { gameName: 'Cody Cutter', customName: 'The Cutter' },
        { gameName: 'Cross Rhodes', customName: '' },
      ],
    });
  });

  it('accepts an empty array (clears the list)', () => {
    expect(parseMoveList([], 'finishers')).toEqual({ value: [] });
  });
});

describe('parseBio', () => {
  it('rejects non-strings', () => {
    expect(parseBio(42)).toEqual({ error: 'Field bio must be a string' });
  });

  it('trims and accepts empty', () => {
    expect(parseBio('  hi  ')).toEqual({ value: 'hi' });
    expect(parseBio('')).toEqual({ value: '' });
  });

  it('rejects over the length cap', () => {
    expect(parseBio('x'.repeat(MAX_BIO_LENGTH + 1))).toHaveProperty('error');
    expect(parseBio('x'.repeat(MAX_BIO_LENGTH))).toEqual({ value: 'x'.repeat(MAX_BIO_LENGTH) });
  });
});

describe('hasMoveset', () => {
  it('needs at least one signature and one finisher', () => {
    expect(hasMoveset({})).toBe(false);
    expect(hasMoveset({ signatures: [{ gameName: 'a', customName: '' }] })).toBe(false);
    expect(hasMoveset({ finishers: [{ gameName: 'a', customName: '' }] })).toBe(false);
    expect(
      hasMoveset({
        signatures: [{ gameName: 'a', customName: '' }],
        finishers: [{ gameName: 'b', customName: '' }],
      }),
    ).toBe(true);
  });

  it('ignores blank gameName rows', () => {
    expect(
      hasMoveset({
        signatures: [{ gameName: '  ', customName: 'x' }],
        finishers: [{ gameName: 'b', customName: '' }],
      }),
    ).toBe(false);
  });
});
