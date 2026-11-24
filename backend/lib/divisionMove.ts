/**
 * The fields written whenever a player's division changes (PRL-04).
 *
 * `divisionJoinedAt` starts the division standings and contender window;
 * `progressionEpochAt` restarts every promotion/relegation track, so nothing
 * from before the move counts toward goals or streaks in the new division.
 */
export interface DivisionMovePatch {
  divisionJoinedAt: string;
  progressionEpochAt: string;
}

/**
 * Build the timestamp patch for a division change. This is the only way to
 * build one: every path that sets, changes or clears a player's `divisionId`
 * spreads this into its write next to the new `divisionId`. Win/loss/draw
 * totals and season standings are deliberately not part of it.
 *
 * Lives in a dependency-free module so the roster repositories can use it
 * without importing `lib/divisions` (which imports the repositories).
 */
export function divisionMovePatch(now: string): DivisionMovePatch {
  return { divisionJoinedAt: now, progressionEpochAt: now };
}
