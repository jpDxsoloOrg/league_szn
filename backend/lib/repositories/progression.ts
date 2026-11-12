/**
 * Progression (CUP-01): goal-based tracks for Young Boys call-ups and
 * division promotion / relegation, plus each player's computed status on
 * every track and an append-only audit log of admin actions.
 *
 * Tables:
 *   - ProgressionTracks  PK trackId
 *   - PlayerProgression  PK playerId, SK trackId;
 *                        GSI TrackIndex (trackId, progressPct)
 *   - ProgressionEvents  PK playerId, SK createdAtEventId
 *                        (`${createdAt}#${eventId}`, so two events written
 *                        in the same millisecond never overwrite each other)
 *
 * Scoring lives in CUP-02; this layer only stores what it is given.
 */
import type {
  PlayerProgression,
  ProgressionConsideration,
  ProgressionEvent,
  ProgressionKind,
  ProgressionTrack,
} from './types';

export interface ProgressionTrackFilter {
  kind?: ProgressionKind;
  isActive?: boolean;
  fromDivisionId?: string;
}

export interface ListByTrackOptions {
  /** Defaults to true: highest progressPct first. */
  descending?: boolean;
  /** Maximum rows to return. Omit for every row on the track. */
  limit?: number;
}

export interface ListProgressionEventsOptions {
  /** Maximum rows to return. Omit for every event. */
  limit?: number;
}

/** Sort key of a ProgressionEvents row. */
export const progressionEventSortKey = (event: Pick<ProgressionEvent, 'createdAt' | 'eventId'>): string =>
  `${event.createdAt}#${event.eventId}`;

export interface ProgressionRepository {
  // ── Tracks ───────────────────────────────────────────────────────
  /** Every track matching the filter (all tracks when omitted), sorted by name. */
  listTracks(filter?: ProgressionTrackFilter): Promise<ProgressionTrack[]>;
  getTrack(trackId: string): Promise<ProgressionTrack | null>;
  /** Create or fully replace a track. The caller owns ids and timestamps. */
  putTrack(track: ProgressionTrack): Promise<ProgressionTrack>;

  // ── Player progression ──────────────────────────────────────────
  getPlayerProgression(playerId: string, trackId: string): Promise<PlayerProgression | null>;
  /** Every track row for one player. Order is by trackId. */
  listByPlayer(playerId: string): Promise<PlayerProgression[]>;
  /**
   * Write the computed fields (`progressPct`, `goals`, `computedAt`),
   * creating the row if needed. An existing `consideration` is kept unless
   * the input carries one, so a recompute never drops an admin's mark. Use
   * `clearConsideration` to remove it. Returns the stored row.
   */
  upsertPlayerProgression(progression: PlayerProgression): Promise<PlayerProgression>;
  /**
   * Every player row on a track via the TrackIndex GSI, sorted by
   * `progressPct` (highest first by default). The index is eventually
   * consistent.
   */
  listByTrack(trackId: string, options?: ListByTrackOptions): Promise<PlayerProgression[]>;
  /** Mark a player as under consideration. Throws `NotFoundError` when the row does not exist. */
  setConsideration(
    playerId: string,
    trackId: string,
    consideration: ProgressionConsideration,
  ): Promise<PlayerProgression>;
  /** Remove the consideration mark. Throws `NotFoundError` when the row does not exist. */
  clearConsideration(playerId: string, trackId: string): Promise<PlayerProgression>;

  // ── Events ──────────────────────────────────────────────────────
  /** Append one audit event. The caller owns `eventId` and `createdAt`. */
  appendEvent(event: ProgressionEvent): Promise<ProgressionEvent>;
  /** One player's events, newest first. */
  listEvents(playerId: string, options?: ListProgressionEventsOptions): Promise<ProgressionEvent[]>;
}
