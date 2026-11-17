/**
 * Default promotion / relegation tracks (DMV-02).
 *
 * When a division gets a tier, every tiered main-roster division is checked
 * and gets a default promotion track (if a division ranks above it) and a
 * default relegation track (if one ranks below it). Checking the whole
 * ladder, not just the edited division, means the order tiers are set in
 * does not matter: setting tier 2 also gives tier 1 its relegation track.
 *
 * Idempotent: a division that already has a track of that kind, active or
 * not, is left alone, so a GM's edits or a paused track are never replaced.
 */

import { randomUUID } from 'crypto';
import { getRepositories } from '../repositories';
import type { Division, ProgressionTrack } from '../repositories/types';
import { invokeAsync } from '../asyncLambda';
import { getDivisionAbove, getDivisionBelow, getDivisionTier } from '../divisionTiers';
import { buildDefaultLadderTrack, type LadderKind } from './defaultTracks';

const LADDER_KINDS: readonly LadderKind[] = ['promotion', 'relegation'];

/**
 * Pure planner: the default tracks missing from `existingTracks`.
 * `newTrackId` is injectable for tests.
 */
export function planDefaultLadderTracks(
  divisions: readonly Division[],
  existingTracks: readonly ProgressionTrack[],
  now: string,
  newTrackId: () => string = randomUUID,
): ProgressionTrack[] {
  const taken = new Set(existingTracks.map((track) => `${track.kind}:${track.fromDivisionId}`));
  const planned: ProgressionTrack[] = [];

  for (const division of divisions) {
    if (division.isDevelopmental === true || getDivisionTier(division) === undefined) continue;
    for (const kind of LADDER_KINDS) {
      if (taken.has(`${kind}:${division.divisionId}`)) continue;
      const neighbours = kind === 'promotion'
        ? getDivisionAbove(divisions, division.divisionId)
        : getDivisionBelow(divisions, division.divisionId);
      if (neighbours.length === 0) continue;
      planned.push(buildDefaultLadderTrack({
        trackId: newTrackId(),
        kind,
        fromDivisionId: division.divisionId,
        divisionName: division.name,
        now,
      }));
    }
  }
  return planned;
}

/**
 * Create any missing default ladder tracks and queue a progression
 * recompute for the players in the affected divisions (one async invoke).
 * Returns the tracks created.
 */
export async function ensureDefaultLadderTracks(): Promise<ProgressionTrack[]> {
  const { leagueOps, progression, roster } = getRepositories();
  const [divisions, tracks] = await Promise.all([leagueOps.divisions.list(), progression.listTracks()]);
  const planned = planDefaultLadderTracks(divisions, tracks, new Date().toISOString());
  if (planned.length === 0) return [];

  const created: ProgressionTrack[] = [];
  for (const track of planned) created.push(await progression.putTrack(track));

  try {
    const divisionIds = new Set(created.map((track) => track.fromDivisionId));
    const players = await roster.players.list();
    const playerIds = players
      .filter((player) => player.divisionId !== undefined && divisionIds.has(player.divisionId))
      .map((player) => player.playerId);
    if (playerIds.length > 0) await invokeAsync('progression', { playerIds });
  } catch (err) {
    // The tracks are saved; the next recompute trigger catches the players up.
    console.warn('Failed to queue progression recompute for default ladder tracks:', err);
  }
  return created;
}
