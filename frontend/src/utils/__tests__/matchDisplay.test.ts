import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import type { Match } from '../../types';
import {
  computePlayerForm,
  describeSides,
  formatMatchType,
  getMatchResult,
  groupMatchSides,
  matchFormatKey,
} from '../matchDisplay';

const t = ((_key: string, fallback: string) => fallback) as unknown as TFunction;

describe('formatMatchType', () => {
  it.each([
    ['singles', 'Singles'],
    ['Singles', 'Singles'],
    ['Single', 'Singles'],
    ['tag', 'Tag Team'],
    ['tag-team', 'Tag Team'],
    ['Tag Team', 'Tag Team'],
    ['triple-threat', 'Triple Threat'],
    ['Triple Threat', 'Triple Threat'],
    ['fatal-4-way', 'Fatal Four Way'],
    ['Fatal Four Way', 'Fatal Four Way'],
    ['6-pack-challenge', '6-Pack Challenge'],
    ['street_fight', 'Street Fight'],
  ])('reads %s', (raw, expected) => {
    expect(formatMatchType(raw, t)).toBe(expected);
  });

  it('is empty when there is no format', () => {
    expect(formatMatchType(undefined, t)).toBe('');
  });

  it('asks for a translation of known formats', () => {
    const keys: string[] = [];
    const recording = ((key: string) => {
      keys.push(key);
      return key;
    }) as unknown as TFunction;
    formatMatchType('6-pack-challenge', recording);
    expect(keys).toEqual(['matchFormats.sixPack']);
  });
});

describe('matchFormatKey', () => {
  it('gives every spelling of a format one key', () => {
    expect(matchFormatKey('Fatal Four Way')).toBe(matchFormatKey('fatal-4-way'));
    expect(matchFormatKey('Single')).toBe(matchFormatKey('singles'));
  });
});

describe('groupMatchSides', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const self = (id: string) => id;

  it('follows stored teams', () => {
    expect(groupMatchSides(ids, self, [['a', 'c'], ['b', 'd']], 'tag')).toEqual([['a', 'c'], ['b', 'd']]);
  });

  it('keeps a player no team lists', () => {
    expect(groupMatchSides(ids, self, [['a'], ['b']], 'tag')).toEqual([['a'], ['b'], ['c'], ['d']]);
  });

  it('halves a tag match with no stored teams', () => {
    expect(groupMatchSides(ids, self, undefined, 'tag-team')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('leaves everyone alone in a multi-man match', () => {
    expect(groupMatchSides(ids, self, undefined, 'fatal-4-way')).toEqual([['a'], ['b'], ['c'], ['d']]);
  });
});

describe('describeSides', () => {
  it('uses one vs between two sides', () => {
    expect(describeSides([['A', 'B'], ['C', 'D']], 'vs')).toBe('A & B vs C & D');
  });

  it('lists a bigger field', () => {
    expect(describeSides([['A'], ['B'], ['C']], 'vs')).toBe('A, B, C');
  });
});

describe('form', () => {
  const match = (date: string, winners: string[], losers: string[]) =>
    ({ matchId: date, date, status: 'completed', winners, losers }) as unknown as Match;

  it('treats winners with no losers as a draw', () => {
    expect(getMatchResult({ winners: ['p1', 'p2'], losers: [] }, 'p1')).toBe('D');
  });

  it('ignores matches the player has no result in', () => {
    expect(getMatchResult({ winners: ['p2'], losers: ['p3'] }, 'p1')).toBeNull();
  });

  it('reads newest first, whatever order the matches arrive in', () => {
    const form = computePlayerForm('p1', [
      match('2026-01-01', ['p1'], ['p2']),
      match('2026-03-01', ['p2'], ['p1']),
      match('2026-02-01', ['p2'], ['p1']),
    ]);
    expect(form.recentForm).toEqual(['L', 'L', 'W']);
    expect(form.currentStreak).toEqual({ type: 'L', count: 2 });
  });

  it('skips matches still to be played and caps the form', () => {
    const upcoming = { ...match('2026-06-01', [], []), status: 'scheduled' } as Match;
    const wins = ['01', '02', '03', '04', '05', '06'].map((month) => match(`2025-${month}-01`, ['p1'], ['p2']));
    const form = computePlayerForm('p1', [upcoming, ...wins]);
    expect(form.recentForm).toHaveLength(5);
    expect(form.currentStreak).toEqual({ type: 'W', count: 6 });
  });

  it('has no streak before the first match', () => {
    expect(computePlayerForm('p1', [])).toEqual({ recentForm: [] });
  });
});
