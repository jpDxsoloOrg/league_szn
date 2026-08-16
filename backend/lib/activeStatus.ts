import type { ActiveOverride } from './repositories/types';

/**
 * Active / inactive wrestler status.
 *
 * A wrestler is active once they have completed a match in the current season,
 * and stays active for the rest of it. Rather than storing a boolean that has
 * to be reset for every player at season rollover, we store the season of the
 * player's most recent completed match (`lastActiveSeasonId`) and derive the
 * status. Starting a new season therefore makes everyone inactive for free.
 *
 * Admins can force a player active or inactive via `activeOverride`. The
 * override is stamped with the season it was set in and only counts while that
 * matches the active season, so it expires at rollover the same way.
 */
export interface PlayerActivity {
  lastActiveSeasonId?: string | null;
  activeOverride?: ActiveOverride | null;
}

/**
 * Whether `player` counts as active for `activeSeasonId`.
 *
 * Returns `false` when there is no active season. Callers that would then
 * render an empty page (all-time standings, the off-season) should skip the
 * filter entirely rather than pass `undefined` and hide everyone.
 */
export function isPlayerActive(
  player: PlayerActivity,
  activeSeasonId: string | undefined,
): boolean {
  if (!activeSeasonId) return false;
  const override = player.activeOverride;
  if (override && override.seasonId === activeSeasonId) {
    return override.value;
  }
  return player.lastActiveSeasonId === activeSeasonId;
}

/** Whether an admin override is currently in force for `activeSeasonId`. */
export function hasActiveOverride(
  player: PlayerActivity,
  activeSeasonId: string | undefined,
): boolean {
  return Boolean(
    activeSeasonId &&
      player.activeOverride &&
      player.activeOverride.seasonId === activeSeasonId,
  );
}

export function filterActivePlayers<T extends PlayerActivity>(
  players: T[],
  activeSeasonId: string | undefined,
): T[] {
  return players.filter((player) => isPlayerActive(player, activeSeasonId));
}
