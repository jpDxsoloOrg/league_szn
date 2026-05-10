/**
 * Faction-channel + faction direct-message aggregates.
 *
 * Two new tables, one repository per aggregate:
 *  - FactionMessages: shared channel, every active member can read+write
 *  - FactionDirectMessages: 1:1 thread between two members of the same faction
 *
 * Audience-only enforcement (must be an active member, must be a member of
 * the right pair, etc.) lives in the calling handlers — these tables have no
 * per-row ACL. Callers must verify membership before reading or writing.
 */

// ─── Domain types ──────────────────────────────────────────────────────

export type FactionMessageType = 'user' | 'system';

export interface FactionMessage {
  messageId: string;
  factionId: string;
  authorPlayerId: string;
  body: string;
  messageType: FactionMessageType;
  createdAt: string;
}

export interface FactionDirectMessage {
  messageId: string;
  factionId: string;
  /** Deterministic sort of [a, b] joined by `#`. See buildThreadKey. */
  threadKey: string;
  senderPlayerId: string;
  recipientPlayerId: string;
  body: string;
  createdAt: string;
}

export interface FactionMessagePostInput {
  factionId: string;
  authorPlayerId: string;
  body: string;
  messageType?: FactionMessageType;
}

export interface FactionDirectMessagePostInput {
  factionId: string;
  senderPlayerId: string;
  recipientPlayerId: string;
  body: string;
}

export interface FactionDirectThreadSummary {
  threadKey: string;
  partnerPlayerId: string;
  lastMessage: FactionDirectMessage;
  unreadCount: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Build the deterministic thread key for two players. Sorting keeps both
 * sides on the same row regardless of who posts. Computing this in the repo
 * (not the caller) prevents off-by-order bugs.
 */
export function buildThreadKey(playerA: string, playerB: string): string {
  if (!playerA || !playerB) {
    throw new Error('buildThreadKey: both player ids required');
  }
  if (playerA === playerB) {
    throw new Error('buildThreadKey: players must differ');
  }
  return [playerA, playerB].sort().join('#');
}

// ─── Repository interfaces ─────────────────────────────────────────────

export interface ListPageOptions {
  cursor?: string;
  limit?: number;
}

export interface ListPage<T> {
  items: T[];
  nextCursor?: string;
}

export interface FactionMessagesRepository {
  /**
   * List messages for a faction's shared channel, newest first.
   * Pagination cursor is opaque (encoded LastEvaluatedKey).
   */
  list(factionId: string, opts?: ListPageOptions): Promise<ListPage<FactionMessage>>;

  /** Append one message to the channel. Returns the persisted record. */
  post(input: FactionMessagePostInput): Promise<FactionMessage>;
}

export interface FactionDirectMessagesRepository {
  /**
   * List the messages of a single thread (newest first).
   * The caller must already have computed `threadKey` via {@link buildThreadKey}.
   */
  listThread(
    factionId: string,
    threadKey: string,
    opts?: ListPageOptions,
  ): Promise<ListPage<FactionDirectMessage>>;

  /**
   * Append one direct message. Computes `threadKey` from
   * sender+recipient internally so callers can't mis-order it.
   */
  post(input: FactionDirectMessagePostInput): Promise<FactionDirectMessage>;

  /**
   * Enumerate every thread the player participates in inside the faction.
   * Powers the Messages tab's left rail.
   *
   * Note: `unreadCount` is best-effort; v1 returns 0 because read-receipts
   * aren't tracked yet. The shape lives in the interface so FAC-14 can fill
   * it in without a repo signature change.
   */
  listThreadsForPlayer(
    factionId: string,
    playerId: string,
  ): Promise<FactionDirectThreadSummary[]>;
}
