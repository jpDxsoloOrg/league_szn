/**
 * Placeholder stored in `Player.currentWrestler` when a player has no roster
 * wrestler assigned yet.
 *
 * Sign-up no longer asks new users to pick a wrestler, so every player starts
 * out holding this placeholder until a wrestler is assigned (by an admin from
 * Manage Users / Manage Players, or by the player from their own profile).
 * A player on the placeholder keeps their account and profile, but is hidden
 * from public roster views until they have a real name (see `isPlayerVisible`).
 * Writers store this string rather than a blank so the state stays explicit;
 * blank and whitespace-only legacy values are treated the same way on read.
 */
export const NEEDS_WRESTLER = 'Needs Wrestler';

/** Shown to a hidden player who tries to do something that needs a wrestler. */
export const SET_WRESTLER_NAME_MESSAGE = 'Set your wrestler name first';

/** Shown to a caller who targets a hidden player with a challenge or call-out. */
export const TARGET_NEEDS_WRESTLER_MESSAGE = 'That player has not set a wrestler name yet';

/**
 * True when a player's denormalized wrestler name is the "no wrestler yet"
 * placeholder, or is missing, empty, or whitespace-only.
 */
export function isNeedsWrestler(name: string | null | undefined): boolean {
  const trimmed = name?.trim();
  return !trimmed || trimmed.toLowerCase() === NEEDS_WRESTLER.toLowerCase();
}

/**
 * True when a player may appear on public roster-facing screens: they must
 * have a real wrestler name. Computed from the name, never stored. Do not use
 * this for self-lookups, staff lists, or resolving names on historical records.
 */
export function isPlayerVisible(player: { currentWrestler?: string | null }): boolean {
  return !isNeedsWrestler(player.currentWrestler);
}

/**
 * Of the given player IDs, the ones that exist and are hidden. Unknown IDs are
 * left out so a deleted player's rows keep their existing treatment.
 */
export async function findHiddenPlayerIds(
  playerIds: Iterable<string>,
  findById: (playerId: string) => Promise<{ currentWrestler?: string | null } | null>,
): Promise<Set<string>> {
  const uniqueIds = Array.from(new Set(playerIds));
  const players = await Promise.all(uniqueIds.map((playerId) => findById(playerId)));
  const hiddenIds = new Set<string>();
  uniqueIds.forEach((playerId, index) => {
    const player = players[index];
    if (player && !isPlayerVisible(player)) hiddenIds.add(playerId);
  });
  return hiddenIds;
}
