/**
 * Match ratings (RIV-20).
 *
 * Persistence layer for user-submitted match ratings on a half-star
 * 0.5–5 scale. One row per `(matchId, userId)` — uniqueness is enforced
 * by a ConditionExpression on the create write (`attribute_not_exists(matchId)`).
 *
 * Reads are unfiltered: handlers decide what's exposed (e.g. only the
 * caller's own rating, or aggregated rollups). Aggregate fields on the
 * match itself (`avgRating`, `ratingCount`, `matchOfTheNight`) are owned
 * by RIV-22 and live on the Matches table, not here.
 */
import type { MatchRating } from './types';

/**
 * Thrown when a user attempts to rate the same match twice. Repositories
 * surface this as a typed error so handlers in RIV-23+ can map it to a
 * 409 Conflict without sniffing AWS error names.
 */
export class RatingAlreadyExistsError extends Error {
  constructor(public readonly matchId: string, public readonly userId: string) {
    super(`Rating already exists for match ${matchId} by user ${userId}`);
    this.name = 'RatingAlreadyExistsError';
  }
}

export interface MatchRatingCreateInput {
  matchId: string;
  userId: string;
  rating: number;
}

export interface MatchRatingsRepository {
  /**
   * Persist a new rating. Throws `RatingAlreadyExistsError` if a row for
   * the same `(matchId, userId)` already exists.
   */
  create(input: MatchRatingCreateInput): Promise<MatchRating>;

  /** Every rating for one match. Order is undefined. */
  getByMatch(matchId: string): Promise<MatchRating[]>;

  /** One user's rating for one match, or `null` if absent. */
  findByMatchAndUser(matchId: string, userId: string): Promise<MatchRating | null>;

  /**
   * Look up a user's rating for many matches in one round-trip. Used by
   * the dashboard / activity feeds in RIV-24 to badge cards as
   * "already rated". Returns only the matches the user has actually
   * rated — missing rows are omitted.
   */
  getByMatchIdsForUser(matchIds: string[], userId: string): Promise<MatchRating[]>;
}
