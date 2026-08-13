/**
 * Placeholder held by `Player.currentWrestler` when no roster wrestler is
 * assigned yet. Sign-up no longer asks for a wrestler, so new players start
 * here until one is assigned (by an admin, or by the player from their own
 * profile). Mirrors `backend/lib/needsWrestler.ts`.
 */
export const NEEDS_WRESTLER = 'Needs Wrestler';

/**
 * True when a wrestler name is the "no wrestler yet" placeholder (or empty).
 * Use this before rendering `currentWrestler` so the placeholder never shows
 * up as if it were a real wrestler's name.
 */
export function isNeedsWrestler(name: string | null | undefined): boolean {
  return !name || name.trim().toLowerCase() === NEEDS_WRESTLER.toLowerCase();
}
