import { RankingResult } from './rankingCalculator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OverrideType = 'bump_to_top' | 'send_to_bottom';

export interface ActiveOverride {
  playerId: string;
  overrideType: OverrideType;
  createdAt?: string;
}

export interface RankingWithOverride extends RankingResult {
  isOverridden?: boolean;
  overrideType?: OverrideType;
  organicRank?: number;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/** Oldest first, with playerId settling ties so the order never depends on the read. */
function byAge(first: ActiveOverride, second: ActiveOverride): number {
  return (first.createdAt ?? '').localeCompare(second.createdAt ?? '')
    || first.playerId.localeCompare(second.playerId);
}

/**
 * Apply manual overrides to contender rankings, returning at most
 * `maxContenders` rows numbered 1..N.
 *
 * `rankings` holds the organic list in order, plus a row for any bumped player
 * who would not make it on merit. An override with no row is skipped: the
 * calculator gives no row to a player who may not contend for the title, and
 * a player sent to the bottom who isn't listed has nothing to move.
 *
 * Bumped players lead the list, newest override at #1. Players sent to the
 * bottom close it, newest override last. Organic rows fill the places between,
 * and the lowest of them make way when the list is over its limit. If overrides
 * alone exceed it, the oldest are left off, sent-to-bottom players first.
 *
 * This is a pure function — the input arrays are not mutated.
 */
export function applyOverrides(
  rankings: RankingResult[],
  overrides: ActiveOverride[],
  maxContenders: number = rankings.length,
): RankingWithOverride[] {
  if (overrides.length === 0) {
    return rankings.map((r, i) => ({ ...r, rank: i + 1 }));
  }

  const rowsByPlayer = new Map<string, RankingWithOverride>(
    rankings.map((r) => [r.playerId, { ...r, organicRank: r.rank || undefined }]),
  );

  const placedRows = (overrideType: OverrideType): RankingWithOverride[] => overrides
    .filter((override) => override.overrideType === overrideType && rowsByPlayer.has(override.playerId))
    .sort(byAge)
    .map((override) => ({ ...rowsByPlayer.get(override.playerId)!, isOverridden: true, overrideType }));

  const bumped = placedRows('bump_to_top').reverse().slice(0, maxContenders);
  const sentToBottom = placedRows('send_to_bottom');
  const bottomPlaces = Math.min(sentToBottom.length, maxContenders - bumped.length);
  const bottom = sentToBottom.slice(sentToBottom.length - bottomPlaces);

  const overriddenIds = new Set(
    overrides
      .filter((override) => override.overrideType === 'bump_to_top' || override.overrideType === 'send_to_bottom')
      .map((override) => override.playerId),
  );
  const organic = [...rowsByPlayer.values()]
    .filter((row) => !overriddenIds.has(row.playerId))
    .slice(0, maxContenders - bumped.length - bottom.length);

  return [...bumped, ...organic, ...bottom].map((row, i) => ({ ...row, rank: i + 1 }));
}
