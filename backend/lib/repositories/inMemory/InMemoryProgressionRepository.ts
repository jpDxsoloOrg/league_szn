import { NotFoundError } from '../errors';
import {
  progressionEventSortKey,
  type ListByTrackOptions,
  type ListProgressionEventsOptions,
  type NotifiedMilestoneCounts,
  type NotifiedMilestones,
  type ProgressionRepository,
  type ProgressionTrackFilter,
} from '../progression';
import type {
  PlayerProgression,
  ProgressionConsideration,
  ProgressionEvent,
  ProgressionTrack,
} from '../types';

export const playerProgressionKey = (playerId: string, trackId: string): string =>
  `${playerId}#${trackId}`;

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Same upsert semantics as the Dynamo UpdateItem: the computed fields are
 * replaced and an existing `consideration` survives unless the input has one.
 * Shared with InMemoryUnitOfWork.
 */
export function applyProgressionUpsert(
  store: Map<string, PlayerProgression>,
  progression: PlayerProgression,
): PlayerProgression {
  const key = playerProgressionKey(progression.playerId, progression.trackId);
  const existing = store.get(key);
  const next: PlayerProgression = {
    ...(existing ?? {}),
    playerId: progression.playerId,
    trackId: progression.trackId,
    progressPct: progression.progressPct,
    goals: clone(progression.goals),
    computedAt: progression.computedAt,
  };
  if (progression.consideration) next.consideration = clone(progression.consideration);
  store.set(key, next);
  return clone(next);
}

/** A PUT on the same (playerId, createdAtEventId) key replaces the row, as in DynamoDB. */
export function applyEventAppend(store: ProgressionEvent[], event: ProgressionEvent): void {
  const sortKey = progressionEventSortKey(event);
  const index = store.findIndex(
    (row) => row.playerId === event.playerId && progressionEventSortKey(row) === sortKey,
  );
  if (index >= 0) store.splice(index, 1, clone(event));
  else store.push(clone(event));
}

export class InMemoryProgressionRepository implements ProgressionRepository {
  /** Public so the UnitOfWork can stage writes against them. */
  readonly tracksStore: Map<string, ProgressionTrack> = new Map();
  readonly progressionStore: Map<string, PlayerProgression> = new Map();
  readonly eventsStore: ProgressionEvent[] = [];

  // ── Tracks ───────────────────────────────────────────────────────
  async listTracks(filter: ProgressionTrackFilter = {}): Promise<ProgressionTrack[]> {
    return Array.from(this.tracksStore.values())
      .filter((track) =>
        (filter.kind === undefined || track.kind === filter.kind) &&
        (filter.isActive === undefined || track.isActive === filter.isActive) &&
        (filter.fromDivisionId === undefined || track.fromDivisionId === filter.fromDivisionId))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(clone);
  }

  async getTrack(trackId: string): Promise<ProgressionTrack | null> {
    const track = this.tracksStore.get(trackId);
    return track ? clone(track) : null;
  }

  async putTrack(track: ProgressionTrack): Promise<ProgressionTrack> {
    this.tracksStore.set(track.trackId, clone(track));
    return clone(track);
  }

  // ── Player progression ──────────────────────────────────────────
  async getPlayerProgression(playerId: string, trackId: string): Promise<PlayerProgression | null> {
    const row = this.progressionStore.get(playerProgressionKey(playerId, trackId));
    return row ? clone(row) : null;
  }

  async listByPlayer(playerId: string): Promise<PlayerProgression[]> {
    return Array.from(this.progressionStore.values())
      .filter((row) => row.playerId === playerId)
      .sort((a, b) => a.trackId.localeCompare(b.trackId))
      .map(clone);
  }

  async upsertPlayerProgression(progression: PlayerProgression): Promise<PlayerProgression> {
    return applyProgressionUpsert(this.progressionStore, progression);
  }

  async deletePlayerProgression(playerId: string, trackId: string): Promise<void> {
    this.progressionStore.delete(playerProgressionKey(playerId, trackId));
  }

  async listByTrack(trackId: string, options: ListByTrackOptions = {}): Promise<PlayerProgression[]> {
    const direction = options.descending === false ? 1 : -1;
    const rows = Array.from(this.progressionStore.values())
      .filter((row) => row.trackId === trackId)
      .sort((a, b) => direction * (a.progressPct - b.progressPct))
      .map(clone);
    return options.limit === undefined ? rows : rows.slice(0, Math.max(0, options.limit));
  }

  async setConsideration(
    playerId: string,
    trackId: string,
    consideration: ProgressionConsideration,
  ): Promise<PlayerProgression> {
    const row = this.requireRow(playerId, trackId);
    row.consideration = clone(consideration);
    return clone(row);
  }

  async clearConsideration(playerId: string, trackId: string): Promise<PlayerProgression> {
    const row = this.requireRow(playerId, trackId);
    delete row.consideration;
    return clone(row);
  }

  async recordNotifiedMilestones(
    playerId: string,
    trackId: string,
    next: NotifiedMilestones,
    expected: NotifiedMilestoneCounts,
  ): Promise<boolean> {
    const row = this.progressionStore.get(playerProgressionKey(playerId, trackId));
    if (!row) return false;
    if ((row.notifiedThresholds?.length ?? 0) !== expected.thresholds) return false;
    if ((row.notifiedGoalIds?.length ?? 0) !== expected.goals) return false;
    row.notifiedThresholds = [...next.notifiedThresholds];
    row.notifiedGoalIds = [...next.notifiedGoalIds];
    return true;
  }

  private requireRow(playerId: string, trackId: string): PlayerProgression {
    const row = this.progressionStore.get(playerProgressionKey(playerId, trackId));
    if (!row) throw new NotFoundError('PlayerProgression', `${playerId}/${trackId}`);
    return row;
  }

  // ── Events ──────────────────────────────────────────────────────
  async appendEvent(event: ProgressionEvent): Promise<ProgressionEvent> {
    applyEventAppend(this.eventsStore, event);
    return clone(event);
  }

  async listEvents(playerId: string, options: ListProgressionEventsOptions = {}): Promise<ProgressionEvent[]> {
    const rows = this.eventsStore
      .filter((event) => event.playerId === playerId)
      .sort((a, b) => progressionEventSortKey(b).localeCompare(progressionEventSortKey(a)))
      .map(clone);
    return options.limit === undefined ? rows : rows.slice(0, Math.max(0, options.limit));
  }
}
