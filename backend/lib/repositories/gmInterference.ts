/**
 * GM interference requests (ECO-09).
 *
 * A player pays up front and asks the GM for something; the GM delivers all,
 * some or nothing and keeps the money unless they refund it.
 *
 * Storage: its own GmInterference table (PK `requestId`; GSI `PlayerIndex`
 * on playerId + createdAt), not rows in Contracts. Contracts are listed and
 * swept by scans with status filters (GM desk, expiry, season end); mixing a
 * second row shape in there would make every one of those reads filter it
 * back out, and the two records share no fields or lifecycle.
 *
 * Rows are written only through the unit of work, together with the money:
 * `tx.createGmInterferenceRequest` rides with the `purchase` posting and
 * `tx.resolveGmInterferenceRequest` with the optional `refund` posting.
 */

export type GmInterferenceOutcome = 'delivered' | 'partial' | 'taken' | 'refunded';
export type GmInterferenceStatus = 'pending' | GmInterferenceOutcome;

export const GM_INTERFERENCE_OUTCOMES: readonly GmInterferenceOutcome[] = ['delivered', 'partial', 'taken', 'refunded'];
export const GM_INTERFERENCE_STATUSES: readonly GmInterferenceStatus[] = ['pending', ...GM_INTERFERENCE_OUTCOMES];

export const GM_INTERFERENCE_REQUEST_MAX_LENGTH = 500;
export const GM_INTERFERENCE_NOTE_MAX_LENGTH = 1000;

/** What the player reads for each outcome. "taken" wording is fixed by the ticket. */
export const GM_INTERFERENCE_OUTCOME_MESSAGES: Record<GmInterferenceOutcome, string> = {
  delivered: 'The GM granted your request.',
  partial: 'The GM granted part of your request.',
  taken: 'The GM took your money. Better luck next time.',
  refunded: 'The GM turned your request down and refunded your money.',
};

export function isGmInterferenceOutcome(value: unknown): value is GmInterferenceOutcome {
  return typeof value === 'string' && (GM_INTERFERENCE_OUTCOMES as readonly string[]).includes(value);
}

export function isGmInterferenceStatus(value: unknown): value is GmInterferenceStatus {
  return typeof value === 'string' && (GM_INTERFERENCE_STATUSES as readonly string[]).includes(value);
}

/**
 * Key of the charge for a player's `sequence`-th request (1-based). Two
 * requests racing for the same slot share a key, so the ledger lets only one
 * of them through: that is what keeps one pending request per player.
 */
export function gmInterferenceChargeKey(playerId: string, sequence: number): string {
  return `gmInterference#${playerId}#${sequence}`;
}

/** Key of the one refund a request can ever get. */
export function gmInterferenceRefundKey(requestId: string): string {
  return `gmInterference#${requestId}#refund`;
}

export interface GmInterferenceRequest {
  requestId: string;
  playerId: string;
  /** What the player asked for, at most 500 characters. */
  request: string;
  /** Optional match the request is about. */
  matchId?: string;
  status: GmInterferenceStatus;
  /** What was charged (`shop.gmInterference.price` at request time). */
  price: number;
  /** 1-based count of this player's requests; part of the charge key. */
  sequence: number;
  chargeEntryId: string;
  chargeKey: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  /** Cognito sub of the GM who resolved it. Staff only. */
  resolvedBy?: string;
  /** Shown to the player. */
  publicNote?: string;
  /** Staff only; never sent to the player. */
  privateNote?: string;
  /** Set when the outcome is `refunded`. */
  refundEntryId?: string;
}

/** Fields `resolve` writes; the stored status must still be `pending`. */
export interface GmInterferenceResolution {
  status: GmInterferenceOutcome;
  resolvedAt: string;
  resolvedBy: string;
  publicNote?: string;
  privateNote?: string;
  refundEntryId?: string;
}

/** The player's view of their own request: no private note, no GM id, no ledger keys. */
export interface PlayerGmInterferenceView {
  requestId: string;
  request: string;
  matchId?: string;
  status: GmInterferenceStatus;
  price: number;
  createdAt: string;
  resolvedAt?: string;
  publicNote?: string;
  /** The outcome line for a resolved request. */
  outcomeMessage?: string;
}

export function toPlayerGmInterferenceView(row: GmInterferenceRequest): PlayerGmInterferenceView {
  return {
    requestId: row.requestId,
    request: row.request,
    ...(row.matchId !== undefined && { matchId: row.matchId }),
    status: row.status,
    price: row.price,
    createdAt: row.createdAt,
    ...(row.resolvedAt !== undefined && { resolvedAt: row.resolvedAt }),
    ...(row.publicNote !== undefined && { publicNote: row.publicNote }),
    ...(row.status !== 'pending' && { outcomeMessage: GM_INTERFERENCE_OUTCOME_MESSAGES[row.status] }),
  };
}

/** Applies a resolution to a row (shared by the in-memory store and tests). */
export function applyGmInterferenceResolution(
  row: GmInterferenceRequest,
  resolution: GmInterferenceResolution,
): GmInterferenceRequest {
  return {
    ...row,
    status: resolution.status,
    resolvedAt: resolution.resolvedAt,
    resolvedBy: resolution.resolvedBy,
    ...(resolution.publicNote !== undefined && { publicNote: resolution.publicNote }),
    ...(resolution.privateNote !== undefined && { privateNote: resolution.privateNote }),
    ...(resolution.refundEntryId !== undefined && { refundEntryId: resolution.refundEntryId }),
    updatedAt: resolution.resolvedAt,
  };
}

export interface GmInterferenceListFilter {
  status?: GmInterferenceStatus;
}

export interface GmInterferenceRepository {
  findById(requestId: string): Promise<GmInterferenceRequest | null>;
  /** One player's requests, newest first (PlayerIndex). */
  listByPlayer(playerId: string): Promise<GmInterferenceRequest[]>;
  /** Every request (optionally one status), newest first. Scans: fine at league size. */
  list(filter?: GmInterferenceListFilter): Promise<GmInterferenceRequest[]>;
}
