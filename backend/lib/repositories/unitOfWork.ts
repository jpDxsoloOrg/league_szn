/**
 * Record delta for player/season standings.
 * Positive values increment; negative decrement.
 */
export interface RecordDelta {
  wins?: number;
  losses?: number;
  draws?: number;
}

/**
 * A unit of work that stages mutations across multiple aggregates and commits
 * them atomically (within the limits of the underlying store).
 *
 * DynamoDB implementation: stages TransactWriteItems, flushes in ≤100-item
 * chunks. Sequential chunks are NOT globally atomic — same as today's
 * recordResult.ts behaviour (see plan §"Transaction boundary").
 *
 * InMemory implementation: stages mutations, applies on commit, discards on
 * rollback.
 *
 * Reads inside the UoW go straight through to the DB — no read-your-own-writes
 * across staged operations.
 */
export interface UnitOfWork {
  /** Stage a player field update (SET fields). */
  updatePlayer(playerId: string, patch: Record<string, unknown>): void;

  /** Stage a player record increment/decrement. */
  incrementPlayerRecord(playerId: string, delta: RecordDelta): void;

  /** Stage a player field removal (REMOVE field, SET updatedAt). */
  clearPlayerField(playerId: string, field: string): void;

  /** Stage a player tagTeamId SET with condition (attribute_not_exists OR null). */
  setPlayerTagTeamId(playerId: string, tagTeamId: string): void;

  /** Stage a tag team field update. */
  updateTagTeam(tagTeamId: string, patch: Record<string, unknown>): void;

  /** Stage a tag team hard delete. */
  deleteTagTeam(tagTeamId: string): void;

  /** Stage a championship field update. */
  updateChampionship(championshipId: string, patch: Record<string, unknown>): void;

  /** Stage REMOVE currentChampion + version bump. */
  removeChampion(championshipId: string): void;

  /** Stage closing a championship reign (SET lostDate, daysHeld). */
  closeReign(championshipId: string, wonDate: string, lostDate: string, daysHeld: number): void;

  /** Stage opening a new championship reign (PUT history entry). */
  startReign(entry: Record<string, unknown>): void;

  /** Stage incrementing defense count on a reign. */
  incrementDefenses(championshipId: string, wonDate: string): void;

  /** Stage a challenge field update. */
  updateChallenge(challengeId: string, patch: Record<string, unknown>): void;

  /** Stage creating a new challenge. */
  createChallenge(challenge: Record<string, unknown>): void;

  /** Stage a season standing increment/decrement. */
  incrementStanding(seasonId: string, playerId: string, delta: RecordDelta): void;

  /** Stage a match field update. */
  updateMatch(matchId: string, date: string, patch: Record<string, unknown>): void;

  /** Flush all staged operations. */
  commit(): Promise<void>;

  /** Discard all staged operations. */
  rollback(): Promise<void>;
}

export type UnitOfWorkFactory = <T>(fn: (tx: UnitOfWork) => Promise<T>) => Promise<T>;
