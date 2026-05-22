/**
 * Rivalries domain types.
 *
 * A Rivalry is an admin-moderated narrative thread between two or more
 * players (or tag teams) that groups storyline beats, plans, in-character
 * promo messaging, and the matches that advance the feud. RIV-01 defines
 * the data shape; later RIV-* tickets layer handlers and UI on top.
 */

/** Lifecycle of a rivalry from request through conclusion. */
export type RivalryStatus =
  | 'pending'    // submitted for admin approval
  | 'active'     // approved and ongoing
  | 'completed'  // resolved on screen
  | 'rejected'   // admin declined the request
  | 'cancelled'; // withdrawn before/after approval

/** Intensity tier surfaced to the UI as the storyline escalates. */
export type RivalryHeat = 'cold' | 'warm' | 'hot';

/**
 * A participant's narrative role inside a rivalry. Kept loose so the
 * same shape works for 1v1 feuds and multi-player storylines.
 */
export type RivalryParticipantRole = 'instigator' | 'rival';

/** A participant entry on a rivalry. */
export interface RivalryParticipant {
  playerId: string;
  role: RivalryParticipantRole;
  addedAt: string;
}

/** Top-level rivalry aggregate (the "META" row in DynamoDB terms). */
export interface Rivalry {
  rivalryId: string;
  title: string;
  description?: string;
  status: RivalryStatus;
  heat: RivalryHeat;
  participants: RivalryParticipant[];
  /** Player who submitted the request. */
  requestedBy: string;
  /** Admin who approved or rejected the request. */
  moderatedBy?: string;
  moderationNote?: string;
  /** Set when the rivalry moves to `active`. */
  startedAt?: string;
  /** Set when the rivalry moves to `completed`. */
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Who can read a given message. Enforced by handlers, not the table. */
export type RivalryMessageAudience = 'all' | 'participants' | 'admins';

/** A single in-character or out-of-character message on a rivalry. */
export interface RivalryMessage {
  rivalryId: string;
  messageId: string;
  authorPlayerId: string;
  body: string;
  audience: RivalryMessageAudience;
  createdAt: string;
}

/**
 * Notes attached to a rivalry. Split into "storyline" (canon beats) and
 * "plan" (booker-only future steps); role-based visibility is enforced
 * by handlers based on the requesting user's role + the participant set.
 */
export type RivalryNoteType = 'storyline' | 'plan';

/** Visibility audience for a single note. */
export type RivalryNoteVisibility = 'all' | 'participants' | 'admins';

export interface RivalryNote {
  rivalryId: string;
  noteId: string;
  noteType: RivalryNoteType;
  visibility: RivalryNoteVisibility;
  body: string;
  authorPlayerId: string;
  /** Optional pointer to a future match this note plans for. Advisory; the linked
   *  record may have been deleted — the Notes & Plans UI handles missing links. */
  linkedMatchId?: string;
  /** Optional pointer to an event this note plans for. Advisory only. */
  linkedEventId?: string;
  /** When the plan is meant to play out. ISO string. */
  scheduledFor?: string;
  createdAt: string;
  updatedAt: string;
}

/** Input for creating a new rivalry request. */
export interface CreateRivalryInput {
  title: string;
  description?: string;
  /** All participants including the requester. Roles default to 'rival'. */
  participants: Array<{ playerId: string; role?: RivalryParticipantRole }>;
  requestedBy: string;
  /** Initial heat; defaults to 'warm' if omitted. */
  heat?: RivalryHeat;
}

// ─── Activity feed (RIV-03) ────────────────────────────────────────────

/**
 * Discriminator on a single feed entry. The Hub's "Recent Rivalry
 * Activity" stream merges these four sources into one chronologically-
 * sorted list.
 */
export type RivalryActivityKind = 'message' | 'promo' | 'match' | 'note';

interface BaseRivalryActivityItem {
  /** Rivalry this entry was attributed to (for grouping / linkout). */
  rivalryId: string;
  /** Normalized timestamp used for cross-source sorting and cursoring. */
  occurredAt: string;
}

export interface RivalryMessageActivityItem extends BaseRivalryActivityItem {
  kind: 'message';
  messageId: string;
  authorPlayerId: string;
  body: string;
  audience: RivalryMessageAudience;
}

export interface RivalryPromoActivityItem extends BaseRivalryActivityItem {
  kind: 'promo';
  promoId: string;
  authorPlayerId: string;
  title?: string;
  content: string;
}

export interface RivalryMatchActivityItem extends BaseRivalryActivityItem {
  kind: 'match';
  matchId: string;
  participants: string[];
  winners?: string[];
  status: string;
  isChampionship?: boolean;
  eventId?: string;
}

export interface RivalryNoteActivityItem extends BaseRivalryActivityItem {
  kind: 'note';
  noteId: string;
  noteType: RivalryNoteType;
  visibility: RivalryNoteVisibility;
  body: string;
  authorPlayerId: string;
}

/**
 * Tagged union of feed entries. Frontend consumers can switch on `kind`
 * to render a card per source without losing type information.
 */
export type RivalryActivityItem =
  | RivalryMessageActivityItem
  | RivalryPromoActivityItem
  | RivalryMatchActivityItem
  | RivalryNoteActivityItem;

/** Paginated response from `GET /rivalries/activity`. */
export interface RivalryActivityPage {
  items: RivalryActivityItem[];
  /**
   * `occurredAt` of the tail item when more pages exist; `null` when the
   * feed has been exhausted.
   */
  nextCursor: string | null;
}

// ─── Hydrated detail (RIV-02) ──────────────────────────────────────────

export interface RivalryHeadToHead {
  totalMatches: number;
  championshipMatches: number;
  lastMatchDate?: string;
  recentMatchIds: string[];
  winsByParticipant: Record<string, number>;
  draws: number;
}

export interface RivalryUpcomingEvent {
  eventId: string;
  name: string;
  date: string;
  eventType: string;
  venue?: string;
}

export interface RivalryRecentPromo {
  promoId: string;
  playerId: string;
  title?: string;
  content: string;
  createdAt: string;
}

/** Shape returned by `GET /rivalry-requests/{rivalryId}`. */
export interface HydratedRivalry {
  rivalry: Rivalry;
  headToHead: RivalryHeadToHead;
  nextEvent: RivalryUpcomingEvent | null;
  recentPromos: RivalryRecentPromo[];
  recentMessages: RivalryMessage[];
  notes: RivalryNote[];
}
