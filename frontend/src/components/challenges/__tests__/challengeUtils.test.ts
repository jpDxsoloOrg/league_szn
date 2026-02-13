import { describe, it, expect } from 'vitest';
import { MATCH_TYPES, STIPULATIONS, getInitial } from '../challengeUtils';

describe('challengeUtils', () => {
  describe('MATCH_TYPES', () => {
    it('contains all expected match types', () => {
      expect(MATCH_TYPES).toEqual([
        'Singles',
        'Tag Team',
        'Triple Threat',
        'Fatal 4-Way',
        'Six Pack Challenge',
        'Battle Royal',
      ]);
    });

    it('has 6 match types', () => {
      expect(MATCH_TYPES).toHaveLength(6);
    });
  });

  describe('STIPULATIONS', () => {
    it('contains all expected stipulations including None', () => {
      expect(STIPULATIONS).toEqual([
        'None',
        'Steel Cage',
        'Ladder',
        'Hell in a Cell',
        'Last Man Standing',
        'Iron Man',
        'Tables',
      ]);
    });
  });

  describe('getInitial', () => {
    it('returns the first character uppercased', () => {
      expect(getInitial('Stone Cold')).toBe('S');
    });

    it('uppercases a lowercase first character', () => {
      expect(getInitial('undertaker')).toBe('U');
    });

    it('handles single character name', () => {
      expect(getInitial('X')).toBe('X');
    });
  });
});
