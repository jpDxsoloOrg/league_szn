import {
  RatingAlreadyExistsError,
  type MatchRatingCreateInput,
  type MatchRatingsRepository,
} from '../matchRatings';
import type { MatchRating } from '../types';

const compositeKey = (matchId: string, userId: string): string =>
  `${matchId}#${userId}`;

export class InMemoryMatchRatingsRepository implements MatchRatingsRepository {
  /** Public so the UnitOfWork can stage writes against it. */
  readonly store: Map<string, MatchRating> = new Map();

  async create(input: MatchRatingCreateInput): Promise<MatchRating> {
    const key = compositeKey(input.matchId, input.userId);
    if (this.store.has(key)) {
      throw new RatingAlreadyExistsError(input.matchId, input.userId);
    }
    const rating: MatchRating = {
      matchId: input.matchId,
      userId: input.userId,
      rating: input.rating,
      createdAt: new Date().toISOString(),
    };
    this.store.set(key, rating);
    return { ...rating };
  }

  async getByMatch(matchId: string): Promise<MatchRating[]> {
    return Array.from(this.store.values())
      .filter((r) => r.matchId === matchId)
      .map((r) => ({ ...r }));
  }

  async findByMatchAndUser(
    matchId: string,
    userId: string,
  ): Promise<MatchRating | null> {
    const row = this.store.get(compositeKey(matchId, userId));
    return row ? { ...row } : null;
  }

  async getByMatchIdsForUser(
    matchIds: string[],
    userId: string,
  ): Promise<MatchRating[]> {
    if (matchIds.length === 0) return [];
    const wanted = new Set(matchIds);
    return Array.from(this.store.values())
      .filter((r) => r.userId === userId && wanted.has(r.matchId))
      .map((r) => ({ ...r }));
  }
}
