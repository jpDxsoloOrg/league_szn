/**
 * Helpers for the half-star rating scale used by RIV-20+ (MatchRatings).
 *
 * Star ratings are constrained to the inclusive range [0.5, 5] in 0.5
 * increments. `roundToHalfStar` is also used to derive the displayed
 * `Match.starRating` from the raw mean (`Match.ratingAverage`).
 */

/** Round a number to the nearest 0.5. Clamps to `>= 0`. */
export const roundToHalfStar = (n: number): number => {
  if (n < 0) return 0;
  return Math.round(n * 2) / 2;
};

/** True if `n` is a valid half-star rating between 0.5 and 5 (inclusive). */
export const isHalfStarRating = (n: unknown): n is number => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return false;
  if (n < 0.5 || n > 5) return false;
  return (n * 2) % 1 === 0;
};
