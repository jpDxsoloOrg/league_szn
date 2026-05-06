import type { MatchSlot, Player } from '../../lib/repositories/types';

export interface HydratedMatchSlot extends MatchSlot {
  /** Display name of the assigned player. Only set when the slot is filled. */
  playerName?: string;
  /**
   * Display name of the wrestler this player is bringing. Prefers
   * `wrestlerNameSnapshot` (pinned at claim time, immune to later renames);
   * falls back to the player's `currentWrestler` for legacy slots that
   * predate MSL-03's snapshot field. Only set when the slot is filled.
   */
  wrestlerName?: string;
}

/**
 * Pure read enrichment: returns slots with playerName/wrestlerName populated
 * for each filled slot, sourced from `playerLookup`. Does not persist.
 *
 * `playerLookup` is keyed by playerId. Missing entries fall back to "Unknown".
 */
export function hydrateMatchSlots(
  slots: readonly MatchSlot[],
  playerLookup: Map<string, Player>,
): HydratedMatchSlot[] {
  return slots.map((slot) => {
    if (!slot.playerId) return { ...slot };
    const player = playerLookup.get(slot.playerId);
    // Snapshot wins over the live currentWrestler so a player renaming their
    // gimmick doesn't retroactively rewrite what was billed for past matches.
    const wrestlerName =
      slot.wrestlerNameSnapshot
      ?? player?.currentWrestler
      ?? 'Unknown Wrestler';
    return {
      ...slot,
      playerName: player?.name ?? 'Unknown Player',
      wrestlerName,
    };
  });
}

/** Collect the unique playerIds referenced by filled slots. */
export function collectSlotPlayerIds(slots: readonly MatchSlot[]): string[] {
  const ids = new Set<string>();
  for (const slot of slots) {
    if (slot.playerId) ids.add(slot.playerId);
  }
  return [...ids];
}
