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
  ProgressionEventType,
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

/** CUP-11: the dedupe lists stored on a PlayerProgression row. */
export interface NotifiedMilestones {
  notifiedThresholds: number[];
  notifiedGoalIds: string[];
}

/** Sizes of the stored dedupe lists the caller read (0 when absent). */
export interface NotifiedMilestoneCounts {
  thresholds: number;
  goals: number;
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
   * Remove one player's row on a track (consideration included). A missing
   * row is a no-op. Used by the recompute when a track no longer applies.
   */
  deletePlayerProgression(playerId: string, trackId: string): Promise<void>;
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
  /**
   * CUP-11: store the milestones already announced on a row. Optimistic:
   * writes only when the row exists and its stored lists still have the
   * sizes in `expected` (the lists only grow, so two concurrent recomputes
   * can never both win). Returns false when the check fails.
   */
  recordNotifiedMilestones(
    playerId: string,
    trackId: string,
    next: NotifiedMilestones,
    expected: NotifiedMilestoneCounts,
  ): Promise<boolean>;

  // ── Events ──────────────────────────────────────────────────────
  /** Append one audit event. The caller owns `eventId` and `createdAt`. */
  appendEvent(event: ProgressionEvent): Promise<ProgressionEvent>;
  /** One player's events, newest first. */
  listEvents(playerId: string, options?: ListProgressionEventsOptions): Promise<ProgressionEvent[]>;
  /** Every player's events of one type (a table scan), newest first. Feeds the activity feed. */
  listEventsByType(type: ProgressionEventType): Promise<ProgressionEvent[]>;
}
