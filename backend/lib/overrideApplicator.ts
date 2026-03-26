import { RankingResult } from './rankingCalculator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OverrideType = 'bump_to_top' | 'send_to_bottom';

export interface ActiveOverride {
  playerId: string;
  overrideType: OverrideType;
}

export interface RankingWithOverride extends RankingResult {
  isOverridden?: boolean;
  overrideType?: OverrideType;
  organicRank?: number;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Apply manual overrides to an ordered list of contender rankings.
 *
 * `bump_to_top` overrides move the player to the top of the list (processed
 * in array order so the last bump ends up at rank #1).
 * `send_to_bottom` overrides move the player to the bottom of the list.
 *
 * Players present in overrides but absent from the rankings array are
 * silently skipped. The returned array has sequential rank numbers (1..N).
 *
 * This is a pure function — the input arrays are not mutated.
 */
export function applyOverrides(
  rankings: RankingResult[],
  overrides: ActiveOverride[],
): RankingWithOverride[] {
  if (overrides.length === 0) {
    return rankings.map((r, i) => ({ ...r, rank: i + 1 }));
  }

  // Clone rankings and record each player's organic rank
  const result: RankingWithOverride[] = rankings.map((r, i) => ({
    ...r,
    organicRank: i + 1,
  }));

  // Build a lookup of overrides by playerId
  const bumpToTop: string[] = [];
  const sendToBottom: string[] = [];

  for (const override of overrides) {
    if (override.overrideType === 'bump_to_top') {
      bumpToTop.push(override.playerId);
    } else {
      sendToBottom.push(override.playerId);
    }
  }

  // Process bump_to_top overrides (oldest first so last bump ends at #1)
  for (const playerId of bumpToTop) {
    const idx = result.findIndex((r) => r.playerId === playerId);
    if (idx === -1) continue;

    const [player] = result.splice(idx, 1);
    player.isOverridden = true;
    player.overrideType = 'bump_to_top';
    result.unshift(player);
  }

  // Process send_to_bottom overrides
  for (const playerId of sendToBottom) {
    const idx = result.findIndex((r) => r.playerId === playerId);
    if (idx === -1) continue;

    const [player] = result.splice(idx, 1);
    player.isOverridden = true;
    player.overrideType = 'send_to_bottom';
    result.push(player);
  }

  // Re-number ranks sequentially
  for (let i = 0; i < result.length; i++) {
    result[i].rank = i + 1;
  }

  return result;
}
