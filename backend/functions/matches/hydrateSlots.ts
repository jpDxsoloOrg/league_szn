import type { MatchSlot, Player } from '../../lib/repositories/types';

export interface HydratedMatchSlot extends MatchSlot {
  /** Display name of the assigned player. Only set when the slot is filled. */
  playerName?: string;
  /** The player's currentWrestler at fetch time. Only set when the slot is filled. */
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
    return {
      ...slot,
      playerName: player?.name ?? 'Unknown Player',
      wrestlerName: player?.currentWrestler ?? 'Unknown Wrestler',
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
