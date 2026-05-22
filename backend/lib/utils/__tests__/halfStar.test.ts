import { describe, it, expect } from 'vitest';
import { roundToHalfStar, isHalfStarRating } from '../halfStar';

describe('roundToHalfStar', () => {
  it('returns 0 for 0', () => {
    expect(roundToHalfStar(0)).toBe(0);
  });

  it('rounds 0.24 down to 0', () => {
    expect(roundToHalfStar(0.24)).toBe(0);
  });

  it('rounds 0.25 up to 0.5', () => {
    expect(roundToHalfStar(0.25)).toBe(0.5);
  });

  it('rounds 0.74 down to 0.5', () => {
    expect(roundToHalfStar(0.74)).toBe(0.5);
  });

  it('rounds 0.75 up to 1', () => {
    expect(roundToHalfStar(0.75)).toBe(1);
  });

  it('passes 1 through unchanged', () => {
    expect(roundToHalfStar(1)).toBe(1);
  });

  it('rounds 4.99 up to 5', () => {
    expect(roundToHalfStar(4.99)).toBe(5);
  });

  it('passes 5 through unchanged', () => {
    expect(roundToHalfStar(5)).toBe(5);
  });

  it('clamps negative inputs to 0', () => {
    expect(roundToHalfStar(-1)).toBe(0);
  });
});

describe('isHalfStarRating', () => {
  it('accepts 0.5', () => {
    expect(isHalfStarRating(0.5)).toBe(true);
  });

  it('accepts 1', () => {
    expect(isHalfStarRating(1)).toBe(true);
  });

  it('accepts 4.5', () => {
    expect(isHalfStarRating(4.5)).toBe(true);
  });

  it('accepts 5', () => {
    expect(isHalfStarRating(5)).toBe(true);
  });

  it('rejects 0.4 (below minimum)', () => {
    expect(isHalfStarRating(0.4)).toBe(false);
  });

  it('rejects 0.75 (not a half-step)', () => {
    expect(isHalfStarRating(0.75)).toBe(false);
  });

  it('rejects 5.5 (above maximum)', () => {
    expect(isHalfStarRating(5.5)).toBe(false);
  });

  it("rejects string '4'", () => {
    expect(isHalfStarRating('4')).toBe(false);
  });

  it('rejects NaN', () => {
    expect(isHalfStarRating(NaN)).toBe(false);
  });

  it('rejects Infinity', () => {
    expect(isHalfStarRating(Infinity)).toBe(false);
  });
});
