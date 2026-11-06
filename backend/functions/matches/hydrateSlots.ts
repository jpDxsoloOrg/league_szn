import { FORMER_MEMBER, realWrestlerName, resolveBilledName } from '../../lib/needsWrestler';
import type { MatchSlot, Player } from '../../lib/repositories/types';

export interface HydratedMatchSlot extends MatchSlot {
  /** Display name of the assigned player. Only set when the slot is filled. */
  playerName?: string;
  /**
   * Display name of the wrestler this player is bringing. Prefers
   * `wrestlerNameSnapshot` (pinned at claim time, immune to later renames);
   * falls back to the player's `currentWrestler` for legacy slots that
   * predate MSL-03's snapshot field, then to the player's name. Placeholder
   * values are skipped at each step. Only set when the slot is filled.
   */
  wrestlerName?: string;
  /**
   * Live PSN gamertag from the player record. Unlike `wrestlerName`, this
   * is not snapshotted — a renamed PSN propagates to historical match
   * cards because the value's purpose is "the gamertag to add today", not
   * a brand identity tied to a moment in time. Undefined when the player
   * has no PSN on file or the slot is unfilled.
   */
  psnId?: string;
}

/**
 * Pure read enrichment: returns slots with playerName/wrestlerName populated
 * for each filled slot, sourced from `playerLookup`. Does not persist.
 *
 * `playerLookup` is keyed by playerId. Missing entries fall back to "Former member".
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
    const wrestlerName = resolveBilledName(slot.wrestlerNameSnapshot, player, FORMER_MEMBER);
    // A placeholder stored by an older booking is not a name worth returning.
    const { wrestlerNameSnapshot, ...filledSlot } = slot;
    return {
      ...filledSlot,
      ...(realWrestlerName(wrestlerNameSnapshot) ? { wrestlerNameSnapshot } : {}),
      playerName: player?.name?.trim() || FORMER_MEMBER,
      wrestlerName,
      psnId: player?.psnId,
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
