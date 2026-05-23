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
import type { HeatTier } from '../policies/rivalryHeat';

// ─── Re-exports for convenience ────────────────────────────────────────
export type { ListPage, ListPageOptions } from './factionMessages';

// ─── Domain types (mirror frontend/src/types/rivalry.ts) ───────────────

export type RivalryStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'rejected'
  | 'cancelled';

/**
 * The visible heat tier on a rivalry. Expanded from 3 → 5 tiers in
 * RIV-21 so the `computeRivalryHeat` policy has room to express
 * scorching feuds and dead-end frozen ones distinctly.
 *
 * Sourced from the policy module so the two stay in lock-step.
 */
export type RivalryHeat = HeatTier;

export type RivalryParticipantRole = 'instigator' | 'rival';

/**
 * Which wrestler the player picked to represent in this rivalry. The
 * UI resolves this against the player's currentWrestler /
 * alternateWrestler names — the rivalry itself doesn't snapshot the
 * names so a wrestler rename stays in lockstep.
 */
export type WrestlerVariant = 'primary' | 'alternate';

export interface RivalryParticipant {
  playerId: string;
  role: RivalryParticipantRole;
  /** Optional — defaults to 'primary' on legacy data. */
  wrestlerVariant?: WrestlerVariant;
  addedAt: string;
}

export interface Rivalry {
  rivalryId: string;
  title: string;
  description?: string;
  status: RivalryStatus;
  heat: RivalryHeat;
  /**
   * Raw heat score from `computeRivalryHeat`. Always within
   * [-HEAT_SCORE_CAP, +HEAT_SCORE_CAP]. Legacy rows missing this
   * field are read back as 0.
   */
  heatScore: number;
  participants: RivalryParticipant[];
  requestedBy: string;
  moderatedBy?: string;
  moderationNote?: string;
  startedAt?: string;
  endedAt?: string;
  /** Display name of the GM driving the storyline. Cosmetic — no
   *  permission impact. Visible to all viewers. */
  bookerName?: string;
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
  /** Optional pointer to an upcoming match this note plans for. Advisory only. */
  linkedMatchId?: string;
  /** Optional pointer to an event this note plans for. Advisory only. */
  linkedEventId?: string;
  /** When the note's plan is meant to play out. ISO string. */
  scheduledFor?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Input types ───────────────────────────────────────────────────────

export interface CreateRivalryInput {
  title: string;
  description?: string;
  participants: Array<{
    playerId: string;
    role?: RivalryParticipantRole;
    wrestlerVariant?: WrestlerVariant;
  }>;
  requestedBy: string;
  heat?: RivalryHeat;
}

export interface RivalryPatch {
  title?: string;
  description?: string;
  status?: RivalryStatus;
  heat?: RivalryHeat;
  /** Allow callers (admin overrides, RIV-26 recompute) to write the
   *  raw score alongside the tier name. */
  heatScore?: number;
  moderatedBy?: string;
  moderationNote?: string;
  startedAt?: string;
  endedAt?: string;
  /** Empty string clears the booker; any other value assigns it. */
  bookerName?: string;
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
  linkedMatchId?: string;
  linkedEventId?: string;
  scheduledFor?: string;
}

export interface RivalryNotePatch {
  body?: string;
  visibility?: RivalryNoteVisibility;
  linkedMatchId?: string;
  linkedEventId?: string;
  scheduledFor?: string;
}

// ─── Activity feed (RIV-03) — mirrors frontend/src/types/rivalry.ts ────

export type RivalryActivityKind = 'message' | 'promo' | 'match' | 'note';

interface BaseRivalryActivityItem {
  rivalryId: string;
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

export type RivalryActivityItem =
  | RivalryMessageActivityItem
  | RivalryPromoActivityItem
  | RivalryMatchActivityItem
  | RivalryNoteActivityItem;

export interface RivalryActivityPage {
  items: RivalryActivityItem[];
  nextCursor: string | null;
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
    wrestlerVariant?: WrestlerVariant,
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
