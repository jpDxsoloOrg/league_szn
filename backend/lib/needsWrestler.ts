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
 * Shown in API-built strings where a record points at a player whose name
 * cannot be resolved. The frontend carries the same wording in en and de.
 */
export const FORMER_MEMBER = 'Former member';

/**
 * True when a player's denormalized wrestler name is the "no wrestler yet"
 * placeholder, or is missing, empty, or whitespace-only.
 */
export function isNeedsWrestler(name: string | null | undefined): boolean {
  const trimmed = name?.trim();
  return !trimmed || trimmed.toLowerCase() === NEEDS_WRESTLER.toLowerCase();
}

/** The wrestler name to store on a record, or undefined for the placeholder. */
export function realWrestlerName(name: string | null | undefined): string | undefined {
  return isNeedsWrestler(name) ? undefined : (name as string);
}

/**
 * The name to bill on a match or card: the snapshot taken at booking time, then
 * the live wrestler name, then the player's own name. The placeholder and blank
 * values never count as a name, so a historical row always reads as a person.
 */
export function resolveBilledName(
  snapshot: string | null | undefined,
  player: { name?: string | null; currentWrestler?: string | null } | null | undefined,
  fallback: string,
): string {
  return realWrestlerName(snapshot)
    ?? realWrestlerName(player?.currentWrestler)
    ?? (player?.name?.trim() || fallback);
}

/**
 * True when a player may appear on public roster-facing screens: they must
 * have a real wrestler name and not be deactivated. Do not use this for
 * self-lookups, staff lists, or resolving names on historical records. Callers
 * must pass `deactivatedAt` along with the name, so a projection has to read it.
 */
export function isPlayerVisible(player: { currentWrestler?: string | null; deactivatedAt?: string }): boolean {
  return !isNeedsWrestler(player.currentWrestler) && !player.deactivatedAt;
}

/**
 * True for a live player who is hidden from the roster. A deleted player also
 * holds the placeholder, but their past records are history rather than the
 * work of someone hidden, so reads that see deleted rows keep those records.
 */
export function isHiddenLivePlayer(
  player: { currentWrestler?: string | null; deletedAt?: string; deactivatedAt?: string },
): boolean {
  return !player.deletedAt && !isPlayerVisible(player);
}

/**
 * The name for a new player created from an account: the player name given at
 * sign-up, then a real wrestler name, then a neutral label built from the
 * account id. `name` is public, so the account's email must never be used here.
 */
export function newPlayerName(
  playerName: string | null | undefined,
  wrestlerName: string | null | undefined,
  sub: string,
): string {
  return playerName?.trim() || realWrestlerName(wrestlerName)?.trim() || `Player ${sub.slice(0, 8)}`;
}

/**
 * Of the given player IDs, the ones that exist and are hidden. Unknown IDs are
 * left out so a deleted player's rows keep their existing treatment.
 */
export async function findHiddenPlayerIds(
  playerIds: Iterable<string>,
  findById: (playerId: string) => Promise<{ currentWrestler?: string | null; deactivatedAt?: string } | null>,
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
