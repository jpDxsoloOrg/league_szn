/**
 * Ledger (ECO-02): the one way money moves in the league economy.
 *
 * Tables:
 *   - Ledger             PK playerId, SK sortKey (`${createdAt}#${entryId}`);
 *                        GSI EntryIdIndex (entryId). Append-only: rows are
 *                        never updated or deleted. A correction is a new
 *                        entry (`reversal`, `fineRescinded`, `refund`, `gmAdjust`).
 *   - LedgerIdempotency  PK idempotencyKey. One row per posting, written with
 *                        `attribute_not_exists` in the same transaction as the
 *                        entry, so a retried posting fails instead of paying twice.
 *
 * `Player.balance` caches the running total (missing = 0). Postings go only
 * through `tx.postLedgerEntry` inside `runInTransaction`, which writes the
 * idempotency row, the entry and the balance together.
 */
import { RepositoryError } from './errors';
import type { PlayerEffect } from './types';

export type LedgerEntryKind =
  | 'perMatchPay'
  | 'winBonus'
  | 'salary'
  | 'fine'
  | 'fineRescinded'
  | 'purchase'
  | 'refund'
  | 'gmAdjust'
  | 'reversal';

export const LEDGER_ENTRY_KINDS: readonly LedgerEntryKind[] = [
  'perMatchPay',
  'winBonus',
  'salary',
  'fine',
  'fineRescinded',
  'purchase',
  'refund',
  'gmAdjust',
  'reversal',
];

/** What a posting is about, e.g. `{ type: 'match', id: matchId }`. */
export interface LedgerRef {
  type: string;
  id: string;
}

export interface LedgerEntry {
  playerId: string;
  /** `${createdAt}#${entryId}`, so two entries in the same millisecond never collide. */
  sortKey: string;
  entryId: string;
  createdAt: string;
  kind: LedgerEntryKind;
  /** Signed whole number: positive pays the player, negative takes money. */
  amount: number;
  /** The player's balance once this entry applied. */
  balanceAfter: number;
  refType?: string;
  refId?: string;
  note?: string;
  /** Cognito sub of the person who caused the posting; absent for system postings. */
  actorUserId?: string;
  idempotencyKey: string;
}

export interface PostLedgerEntryInput {
  playerId: string;
  kind: LedgerEntryKind;
  /** Signed whole number. Zero is refused. */
  amount: number;
  /**
   * Unique per real-world posting, e.g. `match#{matchId}#pay#{playerId}`.
   * Posting the same key twice fails with `DuplicatePostingError`.
   */
  idempotencyKey: string;
  ref?: LedgerRef;
  note?: string;
  actorUserId?: string;

  // ECO-08
  /**
   * Shop effects to append to `Player.effects` in the same write as the
   * balance (DynamoDB allows one operation per item per transaction, so a
   * purchase cannot update the player row separately). Not stored on the entry.
   */
  appendPlayerEffects?: PlayerEffect[];
}

/** Ids `postLedgerEntry` assigns at staging time, so callers can link to the entry. */
export interface StagedLedgerEntry {
  entryId: string;
  createdAt: string;
  sortKey: string;
}

/** The row stored in LedgerIdempotency; points back at the entry it guards. */
export interface LedgerIdempotencyRecord {
  idempotencyKey: string;
  playerId: string;
  entryId: string;
  sortKey: string;
  createdAt: string;
}

export interface LedgerPage {
  items: LedgerEntry[];
  /** Opaque; pass back to get the next (older) page. Absent on the last page. */
  nextCursor?: string;
}

export const LEDGER_DEFAULT_PAGE_SIZE = 50;
export const LEDGER_MAX_PAGE_SIZE = 200;
export const LEDGER_IDEMPOTENCY_KEY_MAX_LENGTH = 200;

export const ledgerSortKey = (entry: Pick<LedgerEntry, 'createdAt' | 'entryId'>): string =>
  `${entry.createdAt}#${entry.entryId}`;

export const clampLedgerPageSize = (limit: number | undefined): number => {
  if (!limit || limit <= 0) return LEDGER_DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(limit), LEDGER_MAX_PAGE_SIZE);
};

/**
 * The whole unit of work failed because one of its idempotency keys was
 * already used. Callers treat it as "already done": nothing in that unit of
 * work was written.
 */
export class DuplicatePostingError extends RepositoryError {
  constructor(public readonly idempotencyKey: string) {
    super(`Ledger posting ${idempotencyKey} was already made`);
    this.name = 'DuplicatePostingError';
  }
}

/**
 * A posting that can never succeed: bad amount or key, two postings with the
 * same key in one unit of work, or a posting for a player that the same unit
 * of work also writes some other way (DynamoDB allows one operation per item
 * per transaction, and the balance lives on the player row).
 */
export class InvalidLedgerPostingError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLedgerPostingError';
  }
}

/** Throws `InvalidLedgerPostingError` for input no store would accept. */
export function validateLedgerPosting(input: PostLedgerEntryInput): void {
  if (!input.playerId) throw new InvalidLedgerPostingError('playerId is required');
  if (!LEDGER_ENTRY_KINDS.includes(input.kind)) {
    throw new InvalidLedgerPostingError(`Unknown ledger entry kind: ${String(input.kind)}`);
  }
  if (!Number.isSafeInteger(input.amount) || input.amount === 0) {
    throw new InvalidLedgerPostingError('amount must be a non-zero whole number');
  }
  const key = input.idempotencyKey;
  if (typeof key !== 'string' || key.trim() === '' || key.length > LEDGER_IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new InvalidLedgerPostingError(
      `idempotencyKey must be 1-${LEDGER_IDEMPOTENCY_KEY_MAX_LENGTH} characters`,
    );
  }
}

// ECO-08
/** Every effect the postings append to the player, in staging order. */
export function collectAppendedEffects(
  postings: ReadonlyArray<{ input: PostLedgerEntryInput }>,
): PlayerEffect[] {
  return postings.flatMap(({ input }) => input.appendPlayerEffects ?? []);
}

/** Builds the stored entries for one player's postings, in staging order. */
export function buildLedgerEntries(
  startingBalance: number,
  postings: ReadonlyArray<{ input: PostLedgerEntryInput; staged: StagedLedgerEntry }>,
): LedgerEntry[] {
  let balance = startingBalance;
  return postings.map(({ input, staged }) => {
    balance += input.amount;
    return {
      playerId: input.playerId,
      sortKey: staged.sortKey,
      entryId: staged.entryId,
      createdAt: staged.createdAt,
      kind: input.kind,
      amount: input.amount,
      balanceAfter: balance,
      ...(input.ref && { refType: input.ref.type, refId: input.ref.id }),
      ...(input.note !== undefined && input.note !== '' && { note: input.note }),
      ...(input.actorUserId && { actorUserId: input.actorUserId }),
      idempotencyKey: input.idempotencyKey,
    };
  });
}

export interface LedgerRepository {
  /** One player's entries, newest first. Throws on a malformed cursor. */
  listForPlayer(playerId: string, cursor?: string, limit?: number): Promise<LedgerPage>;
  /** The entry a posting with this key wrote, or null when the key is unused. */
  getByIdempotencyKey(idempotencyKey: string): Promise<LedgerEntry | null>;
  /** One entry by id (EntryIdIndex; eventually consistent), or null. */
  getByEntryId(entryId: string): Promise<LedgerEntry | null>;
}
