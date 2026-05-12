/**
 * Rivalry aggregates (RIV-01).
 *
 * Three aggregates share this file because they're tightly coupled by the
 * Rivalry lifecycle:
 *  - RivalriesRepository      → CRUD + lookups by participant or status
 *  - RivalryMessagesRepository → in-thread posts (audience tag on each row)
 *  - RivalryNotesRepository   → booker/admin notes (storyline + plans)
 *
 * Audience and role-based visibility are enforced by calling handlers,
 * not by the tables — repos return raw rows and the callers filter.
 *
 * The base Rivalries table uses a META + PARTICIPANT row split so the
 * ParticipantIndex GSI can index per-participant rows directly. The
 * "two-write" cost (1 META + N PARTICIPANT writes per rivalry) is cheap
 * relative to the lookup wins it unlocks.
 */
import type { ListPage, ListPageOptions } from './factionMessages';

// ─── Re-exports for convenience ────────────────────────────────────────
export type { ListPage, ListPageOptions } from './factionMessages';

// ─── Domain types (mirror frontend/src/types/rivalry.ts) ───────────────

export type RivalryStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export type RivalryHeat = 'cold' | 'warm' | 'hot';

export type RivalryParticipantRole = 'instigator' | 'rival';

export interface RivalryParticipant {
  playerId: string;
  role: RivalryParticipantRole;
  addedAt: string;
}

export interface Rivalry {
  rivalryId: string;
  title: string;
  description?: string;
  status: RivalryStatus;
  heat: RivalryHeat;
  participants: RivalryParticipant[];
  requestedBy: string;
  moderatedBy?: string;
  moderationNote?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type RivalryMessageAudience = 'all' | 'participants' | 'admins';

export interface RivalryMessage {
  rivalryId: string;
  messageId: string;
  authorPlayerId: string;
  body: string;
  audience: RivalryMessageAudience;
  createdAt: string;
}

export type RivalryNoteType = 'storyline' | 'plan';

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

// ─── Input types ───────────────────────────────────────────────────────

export interface CreateRivalryInput {
  title: string;
  description?: string;
  participants: Array<{ playerId: string; role?: RivalryParticipantRole }>;
  requestedBy: string;
  heat?: RivalryHeat;
}

export interface RivalryPatch {
  title?: string;
  description?: string;
  status?: RivalryStatus;
  heat?: RivalryHeat;
  moderatedBy?: string;
  moderationNote?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface RivalryMessagePostInput {
  rivalryId: string;
  authorPlayerId: string;
  body: string;
  audience?: RivalryMessageAudience;
}

export interface RivalryNoteCreateInput {
  rivalryId: string;
  noteType: RivalryNoteType;
  visibility: RivalryNoteVisibility;
  body: string;
  authorPlayerId: string;
}

export interface RivalryNotePatch {
  body?: string;
  visibility?: RivalryNoteVisibility;
}

// ─── Repository interfaces ─────────────────────────────────────────────

export interface RivalriesRepository {
  /** Return the rivalry with its participant list, or undefined if not found. */
  get(rivalryId: string): Promise<Rivalry | undefined>;

  /** Enumerate rivalries a player is part of (any status). */
  listByParticipant(playerId: string, opts?: ListPageOptions): Promise<ListPage<Rivalry>>;

  /** Enumerate rivalries by status (newest first); powers admin queues. */
  listByStatus(status: RivalryStatus, opts?: ListPageOptions): Promise<ListPage<Rivalry>>;

  /** Persist a new rivalry. Status starts at `pending`. */
  create(input: CreateRivalryInput): Promise<Rivalry>;

  /** Update mutable fields on a rivalry. Returns the post-write record. */
  update(rivalryId: string, patch: RivalryPatch): Promise<Rivalry>;

  /** Attach a new participant row to an existing rivalry. */
  addParticipant(
    rivalryId: string,
    playerId: string,
    role?: RivalryParticipantRole,
  ): Promise<RivalryParticipant>;

  /** Detach a participant row from a rivalry. */
  removeParticipant(rivalryId: string, playerId: string): Promise<void>;

  /** Hard delete the rivalry and all its participant rows. */
  delete(rivalryId: string): Promise<void>;
}

export interface RivalryMessagesRepository {
  /** List messages on a rivalry, newest first. */
  list(rivalryId: string, opts?: ListPageOptions): Promise<ListPage<RivalryMessage>>;

  /** Append one message. */
  post(input: RivalryMessagePostInput): Promise<RivalryMessage>;
}

export interface RivalryNotesRepository {
  /** Every note attached to a rivalry, oldest first. */
  listByRivalry(rivalryId: string): Promise<RivalryNote[]>;

  /** All notes of a given type across rivalries (admin cross-cut view). */
  listByType(noteType: RivalryNoteType, opts?: ListPageOptions): Promise<ListPage<RivalryNote>>;

  /** Persist a new note. */
  create(input: RivalryNoteCreateInput): Promise<RivalryNote>;

  /** Mutate body / visibility on an existing note. */
  update(rivalryId: string, noteId: string, patch: RivalryNotePatch): Promise<RivalryNote>;

  /** Hard delete one note. */
  delete(rivalryId: string, noteId: string): Promise<void>;
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * SK discriminator on the Rivalries table. META holds the aggregate's
 * scalar fields; PARTICIPANT#<playerId> holds one row per participant.
 */
export const RIVALRY_META_SK = 'META';
export function participantSk(playerId: string): string {
  if (!playerId) throw new Error('participantSk: playerId required');
  return `PARTICIPANT#${playerId}`;
}
