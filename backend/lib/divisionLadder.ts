import type { Division, Match, Player } from './repositories/types';
import type { DivisionLadderRules } from './repositories/SiteConfigRepository';

/**
 * Pure, IO-free helpers for the division ladder (auto promotion/demotion).
 * Nothing in here touches a repository; `applyDivisionLadder` (the IO
 * wrapper called from recordResult) composes these.
 */

export type LadderResult = 'W' | 'L' | 'D';

export interface LadderStreak {
  type: LadderResult;
  count: number;
}

export type LadderDirection = 'up' | 'down';

export interface LadderMove {
  direction: 'promoted' | 'demoted';
  fromDivisionId: string;
  toDivisionId: string;
}

export interface EvaluateLadderMoveInput {
  player: Pick<Player, 'playerId' | 'divisionId'>;
  streak: LadderStreak;
  rules: DivisionLadderRules;
  divisions: Division[];
}

function isRanked(division: Division): division is Division & { rank: number } {
  return typeof division.rank === 'number' && Number.isFinite(division.rank);
}

/**
 * Ranked divisions first, ascending by `rank` (0 = bottom / jobber tier),
 * then unranked divisions ordered by `createdAt`. Ties on rank fall back to
 * `createdAt` so the order is stable when ranks drift after a delete.
 */
export function sortDivisionsByRank(divisions: Division[]): Division[] {
  const ranked = divisions.filter(isRanked);
  const unranked = divisions.filter((division) => !isRanked(division));

  ranked.sort((a, b) => a.rank - b.rank || a.createdAt.localeCompare(b.createdAt));
  unranked.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return [...ranked, ...unranked];
}

/**
 * The neighbouring ranked division. `'up'` = the next higher rank, `'down'`
 * = the next lower rank. Returns null at the top/bottom of the ladder, or
 * when the current division is unknown or unranked.
 */
export function getAdjacentDivision(
  divisions: Division[],
  currentDivisionId: string,
  direction: LadderDirection,
): Division | null {
  const ladder = sortDivisionsByRank(divisions).filter(isRanked);
  const index = ladder.findIndex((division) => division.divisionId === currentDivisionId);
  if (index === -1) return null;

  const neighbourIndex = direction === 'up' ? index + 1 : index - 1;
  return ladder[neighbourIndex] ?? null;
}

/** Everyone on the match: explicit participants plus anyone holding a slot. */
function playerIdsOn(match: Match): Set<string> {
  const ids = new Set<string>(match.participants ?? []);
  for (const slot of match.slots ?? []) {
    if (slot.playerId) ids.add(slot.playerId);
  }
  return ids;
}

/** Win if listed in `winners`, loss if listed in `losers`, otherwise a draw. */
function resultForPlayer(playerId: string, match: Match): LadderResult {
  if (match.isDraw) return 'D';
  if ((match.winners ?? []).includes(playerId)) return 'W';
  if ((match.losers ?? []).includes(playerId)) return 'L';
  return 'D';
}

/**
 * The player's current run of identical results, newest first, over their
 * completed matches. When `since` is given (the player's last division
 * change) only matches dated strictly after it count, so a move resets the
 * streak without a persisted counter.
 *
 * Empty history → `{ type: 'W', count: 0 }`, mirroring `recentForm.ts`.
 */
export function computeLadderStreak(
  playerId: string,
  completedMatches: Match[],
  since?: string,
): LadderStreak {
  const results = completedMatches
    .filter((match) => match.status === 'completed')
    .filter((match) => Boolean(match.date))
    .filter((match) => (since ? match.date > since : true))
    .filter((match) => playerIdsOn(match).has(playerId))
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    )
    .map((match) => resultForPlayer(playerId, match));

  if (results.length === 0) {
    return { type: 'W', count: 0 };
  }

  const type = results[0];
  let count = 0;
  for (const result of results) {
    if (result !== type) break;
    count++;
  }

  return { type, count };
}

/**
 * Decides whether a player moves on the ladder. Returns null when nothing
 * should happen: rules disabled, player not in a ranked division, streak
 * below threshold, draws, or no neighbouring division in that direction.
 */
export function evaluateLadderMove(input: EvaluateLadderMoveInput): LadderMove | null {
  const { player, streak, rules, divisions } = input;

  if (!rules.enabled) return null;
  if (!player.divisionId) return null;
  if (streak.count <= 0) return null;

  const current = divisions.find((division) => division.divisionId === player.divisionId);
  if (!current || !isRanked(current)) return null;

  if (streak.type === 'W' && streak.count >= rules.promoteWinStreak) {
    const target = getAdjacentDivision(divisions, current.divisionId, 'up');
    if (!target) return null;
    return { direction: 'promoted', fromDivisionId: current.divisionId, toDivisionId: target.divisionId };
  }

  if (streak.type === 'L' && streak.count >= rules.demoteLossStreak) {
    const target = getAdjacentDivision(divisions, current.divisionId, 'down');
    if (!target) return null;
    return { direction: 'demoted', fromDivisionId: current.divisionId, toDivisionId: target.divisionId };
  }

  return null;
}
