/**
 * Placeholder stored in `Player.currentWrestler` when a player has no roster
 * wrestler assigned yet.
 *
 * Sign-up no longer asks new users to pick a wrestler, so every player starts
 * out holding this placeholder until a wrestler is assigned (by an admin from
 * Manage Users / Manage Players, or by the player from their own profile).
 * It is a real string rather than an empty value on purpose: `GET /players`
 * and several roster views filter out players with a falsy `currentWrestler`,
 * and a player awaiting a wrestler still belongs on the roster.
 */
export const NEEDS_WRESTLER = 'Needs Wrestler';

/**
 * True when a player's denormalized wrestler name is the "no wrestler yet"
 * placeholder (or missing entirely).
 */
export function isNeedsWrestler(name: string | null | undefined): boolean {
  return !name || name.trim().toLowerCase() === NEEDS_WRESTLER.toLowerCase();
}
