import type { ProgressionBoardEntry } from '../../../types/progression';

/** A candidate with no completed match for this many days counts as inactive. */
export const INACTIVE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since the player's last completed match, or null when they have none. */
export function daysSinceLastMatch(entry: Pick<ProgressionBoardEntry, 'lastMatchDate'>, now: number = Date.now()): number | null {
  if (!entry.lastMatchDate) return null;
  const time = Date.parse(entry.lastMatchDate);
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.floor((now - time) / DAY_MS));
}

/** No completed match in the last INACTIVE_DAYS days, including never having had one. */
export function isInactive(entry: Pick<ProgressionBoardEntry, 'lastMatchDate'>, now: number = Date.now()): boolean {
  const days = daysSinceLastMatch(entry, now);
  return days === null || days >= INACTIVE_DAYS;
}
