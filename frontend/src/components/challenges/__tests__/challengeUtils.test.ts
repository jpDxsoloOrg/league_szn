import { describe, it, expect } from 'vitest';
import { getInitial } from '../challengeUtils';

describe('challengeUtils', () => {
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
