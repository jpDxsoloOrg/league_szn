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
