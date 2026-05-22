import type { FactionMessage, FactionDirectMessage } from './factionMessages';
import type {
  Rivalry,
  RivalryMessage,
  RivalryNote,
  RivalryParticipant,
  RivalryPatch,
} from './rivalries';

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

  /**
   * Stage a PUT into the faction-channel messages table.
   * Caller is responsible for generating `messageId` and `createdAt` and for
   * verifying that the author is an active member of the faction.
   */
  appendFactionMessage(message: FactionMessage): void;

  /**
   * Stage a PUT into the faction direct-messages table.
   * Caller passes a fully-built record (including `threadKey` from
   * `buildThreadKey(...)`). The UoW does not validate membership.
   */
  appendFactionDirectMessage(message: FactionDirectMessage): void;

  // ── Rivalries (RIV-01) ───────────────────────────────────────────
  /**
   * Stage the META row + every PARTICIPANT row for a new rivalry. The
   * caller owns id/timestamp generation so this method can be combined
   * with related writes (e.g. a system message) in one transaction.
   */
  createRivalry(rivalry: Rivalry): void;

  /** Stage an update against a rivalry's META row. */
  updateRivalry(rivalryId: string, patch: RivalryPatch): void;

  /** Stage a PUT for one participant row on an existing rivalry. */
  addRivalryParticipant(rivalryId: string, participant: RivalryParticipant): void;

  /** Stage a DELETE for one participant row. */
  removeRivalryParticipant(rivalryId: string, playerId: string): void;

  /** Stage a PUT into the rivalry messages table. */
  appendRivalryMessage(message: RivalryMessage): void;

  /** Stage a PUT into the rivalry notes table. */
  createRivalryNote(note: RivalryNote): void;

  /**
   * Stage deletion of a rivalry's META row plus every PARTICIPANT row.
   * Caller passes the full participant playerId list so the UoW can build
   * the per-participant SKs without an extra Query.
   */
  deleteRivalry(rivalryId: string, participantPlayerIds: string[]): void;

  /** Stage deletion of one rivalry message row. */
  deleteRivalryMessage(message: RivalryMessage): void;

  /** Stage deletion of one rivalry note row. */
  deleteRivalryNote(note: RivalryNote): void;

  /**
   * Stage assigning a wrestler to a player's primary or alternate slot.
   * Sets `isInUse=true` (string on-disk), `assignedPlayerId`, `assignedSlot`.
   */
  assignWrestlerToPlayer(params: {
    wrestlerId: string;
    playerId: string;
    slot: 'primary' | 'alternate';
  }): void;

  /**
   * Stage releasing a wrestler from its current player assignment.
   * Sets `isInUse=false` (string on-disk), REMOVEs `assignedPlayerId`, `assignedSlot`.
   */
  releaseWrestlerFromPlayer(params: { wrestlerId: string }): void;

  /** Flush all staged operations. */
  commit(): Promise<void>;

  /** Discard all staged operations. */
  rollback(): Promise<void>;
}

export type UnitOfWorkFactory = <T>(fn: (tx: UnitOfWork) => Promise<T>) => Promise<T>;
