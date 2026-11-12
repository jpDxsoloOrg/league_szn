/**
 * Progression recompute (CUP-03).
 *
 * Rebuilds `PlayerProgression` rows from the CUP-02 scoring policy. Called by
 * the progression Lambda, either from an async trigger (`invokeAsync(
 * 'progression', { playerIds })` after a result, rating, promo, reaction or
 * division change) or from `POST /admin/progression/recompute`.
 *
 * Per player:
 *   - every ACTIVE track whose `fromDivisionId` is the player's division is
 *     scored and upserted. The upsert keeps an existing `consideration`.
 *   - an existing row whose track no longer applies is dropped: the track's
 *     `fromDivisionId` is not the player's division any more (division
 *     change, transfer, call-up) or the track is gone.
 *   - a row on an INACTIVE track that still matches the player's division is
 *     left untouched (frozen). Pausing a track must not wipe admin marks.
 *
 * Considerations on dropped rows: the row is deleted with its consideration,
 * since the mark ("call this player up FROM division X") is meaningless once
 * the player has left X. A `consideration_removed` event with actor
 * `system` is appended so the audit log explains why the mark vanished.
 *
 * Everything runs inside the calling invocation: no per-player fan-out
 * (the account Lambda concurrency limit is 10, shared by prod and dev).
 */

import { randomUUID } from 'crypto';
import { getRepositories } from '../repositories';
import type { PlayerProgression, ProgressionTrack } from '../repositories/types';
import { computeProgress } from '../policies/progression';
import {
  loadProgressionBatch,
  loadProgressionForPlayers,
  resolveProgressionWindow,
  type ProgressionBatch,
} from './loadInputs';

/** Up to this many players the trigger path uses per-player queries; above it, the table-scan batch loader. */
export const PER_PLAYER_LOADER_MAX = 25;

/** Actor recorded on events the recompute writes itself. */
export const SYSTEM_ACTOR = 'system';

export interface RecomputeProgressionOptions {
  /** Players to recompute. Ignored when `all` is true. */
  playerIds?: readonly string[];
  /** Recompute every (non-deleted) player. */
  all?: boolean;
}

/**
 * One upserted row. `before` is the stored row prior to this recompute
 * (absent for a new row); `after` is the stored row afterwards, with any
 * preserved `consideration`. CUP-11 compares the two for milestones.
 */
export interface ProgressionChange {
  playerId: string;
  trackId: string;
  before?: PlayerProgression;
  after: PlayerProgression;
}

export type ProgressionDropReason = 'divisionChanged' | 'trackMissing';

export interface DroppedProgression {
  playerId: string;
  trackId: string;
  reason: ProgressionDropReason;
  /** The deleted row. */
  row: PlayerProgression;
}

export interface ProgressionRecomputeFailure {
  playerId: string;
  trackId?: string;
  message: string;
}

export interface RecomputeProgressionResult {
  /** Requested players that exist and were processed. */
  playersProcessed: number;
  changes: ProgressionChange[];
  dropped: DroppedProgression[];
  failures: ProgressionRecomputeFailure[];
}

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Existing rows keyed by playerId, then trackId. */
type ExistingRows = Map<string, Map<string, PlayerProgression>>;

function addRow(rows: ExistingRows, row: PlayerProgression): void {
  let byTrack = rows.get(row.playerId);
  if (!byTrack) {
    byTrack = new Map();
    rows.set(row.playerId, byTrack);
  }
  byTrack.set(row.trackId, row);
}

/** All-mode: one GSI query per track instead of one query per player. */
async function loadExistingByTrack(tracks: readonly ProgressionTrack[]): Promise<ExistingRows> {
  const { progression } = getRepositories();
  const rows: ExistingRows = new Map();
  const perTrack = await Promise.all(tracks.map((track) => progression.listByTrack(track.trackId)));
  for (const trackRows of perTrack) trackRows.forEach((row) => addRow(rows, row));
  return rows;
}

async function loadExistingByPlayer(playerIds: readonly string[]): Promise<ExistingRows> {
  const { progression } = getRepositories();
  const rows: ExistingRows = new Map();
  const perPlayer = await Promise.all(playerIds.map((playerId) => progression.listByPlayer(playerId)));
  for (const playerRows of perPlayer) playerRows.forEach((row) => addRow(rows, row));
  return rows;
}

async function resolvePlayerIds(options: RecomputeProgressionOptions): Promise<string[]> {
  if (options.all) {
    const players = await getRepositories().roster.players.list();
    return players.map((player) => player.playerId);
  }
  return [...new Set((options.playerIds ?? []).filter((id) => typeof id === 'string' && id.length > 0))];
}

async function dropRow(
  row: PlayerProgression,
  track: ProgressionTrack | undefined,
  reason: ProgressionDropReason,
  now: string,
): Promise<DroppedProgression> {
  const { progression } = getRepositories();
  await progression.deletePlayerProgression(row.playerId, row.trackId);
  if (row.consideration && track) {
    await progression.appendEvent({
      eventId: randomUUID(),
      playerId: row.playerId,
      trackId: row.trackId,
      kind: track.kind,
      type: 'consideration_removed',
      fromDivisionId: track.fromDivisionId,
      ...(track.toDivisionId ? { toDivisionId: track.toDivisionId } : {}),
      actorUserId: SYSTEM_ACTOR,
      createdAt: now,
    });
  }
  return { playerId: row.playerId, trackId: row.trackId, reason, row };
}

async function recomputePlayer(
  playerId: string,
  batch: ProgressionBatch,
  tracks: readonly ProgressionTrack[],
  existing: Map<string, PlayerProgression>,
  now: string,
  result: RecomputeProgressionResult,
): Promise<void> {
  const { progression } = getRepositories();
  const player = batch.players.get(playerId);
  // Unknown or deleted player: leave any rows alone (a soft-deleted player may come back).
  if (!player) return;
  result.playersProcessed += 1;

  const inputs = batch.inputs.get(playerId) ?? { playerId, matches: [], promos: [], challenges: [] };
  const tracksById = new Map(tracks.map((track) => [track.trackId, track]));
  const applicable = player.divisionId
    ? tracks.filter((track) => track.isActive && track.fromDivisionId === player.divisionId)
    : [];

  for (const track of applicable) {
    try {
      const window = resolveProgressionWindow(track.windowMode, player, batch.activeSeason);
      const { progressPct, goals } = computeProgress(track, inputs, window);
      const before = existing.get(track.trackId);
      const after = await progression.upsertPlayerProgression({
        playerId,
        trackId: track.trackId,
        progressPct,
        goals,
        computedAt: now,
      });
      result.changes.push({ playerId, trackId: track.trackId, ...(before ? { before } : {}), after });
    } catch (err) {
      result.failures.push({ playerId, trackId: track.trackId, message: errorMessage(err) });
    }
  }

  for (const row of existing.values()) {
    const track = tracksById.get(row.trackId);
    let reason: ProgressionDropReason | null = null;
    if (!track) reason = 'trackMissing';
    else if (track.fromDivisionId !== player.divisionId) reason = 'divisionChanged';
    // Same division but inactive track: frozen, kept as is.
    if (!reason) continue;
    try {
      result.dropped.push(await dropRow(row, track, reason, now));
    } catch (err) {
      result.failures.push({ playerId, trackId: row.trackId, message: errorMessage(err) });
    }
  }
}

/**
 * Recompute progression for the given players (or everyone with `all`).
 * A failure on one player/track is recorded in `failures` and does not stop
 * the rest.
 */
export async function recomputeProgression(
  options: RecomputeProgressionOptions,
): Promise<RecomputeProgressionResult> {
  const result: RecomputeProgressionResult = { playersProcessed: 0, changes: [], dropped: [], failures: [] };
  const playerIds = await resolvePlayerIds(options);
  if (playerIds.length === 0) return result;

  const { progression } = getRepositories();
  const tracks = await progression.listTracks();
  const useBatch = options.all === true || playerIds.length > PER_PLAYER_LOADER_MAX;

  const [batch, existing] = await Promise.all([
    useBatch ? loadProgressionBatch(playerIds) : loadProgressionForPlayers(playerIds),
    options.all === true ? loadExistingByTrack(tracks) : loadExistingByPlayer(playerIds),
  ]);

  const now = new Date().toISOString();
  for (const playerId of playerIds) {
    try {
      await recomputePlayer(playerId, batch, tracks, existing.get(playerId) ?? new Map(), now, result);
    } catch (err) {
      result.failures.push({ playerId, message: errorMessage(err) });
    }
  }
  return result;
}
