import { getRepositories } from '../repositories';
import type { ProgressionConsideration, ProgressionKind } from '../repositories';

export const PROGRESSION_KINDS: readonly ProgressionKind[] = ['callup', 'promotion', 'relegation'];

export function isProgressionKind(value: unknown): value is ProgressionKind {
  return typeof value === 'string' && (PROGRESSION_KINDS as readonly string[]).includes(value);
}

export interface ActiveConsideration {
  playerId: string;
  trackId: string;
  consideration: ProgressionConsideration;
}

/**
 * Every current consideration on the active tracks of `kind`, one per player
 * (the earliest mark wins when a player is flagged on several tracks), newest
 * mark first.
 *
 * Reads the small tracks table once, then one TrackIndex query per active
 * track. No per-player reads and no scan of PlayerProgression. The GSI is
 * eventually consistent, so a mark can take a moment to show up here.
 */
export async function listActiveConsiderations(kind: ProgressionKind): Promise<ActiveConsideration[]> {
  const { progression } = getRepositories();
  const tracks = await progression.listTracks({ kind, isActive: true });
  const rowsPerTrack = await Promise.all(tracks.map((track) => progression.listByTrack(track.trackId)));

  const byPlayer = new Map<string, ActiveConsideration>();
  for (const row of rowsPerTrack.flat()) {
    if (!row.consideration) continue;
    const existing = byPlayer.get(row.playerId);
    if (existing && existing.consideration.markedAt <= row.consideration.markedAt) continue;
    byPlayer.set(row.playerId, { playerId: row.playerId, trackId: row.trackId, consideration: row.consideration });
  }

  return Array.from(byPlayer.values()).sort((a, b) =>
    b.consideration.markedAt.localeCompare(a.consideration.markedAt) || a.playerId.localeCompare(b.playerId));
}
