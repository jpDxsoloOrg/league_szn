import type { MatchNoShow, MatchStatus } from '../../types';
import { NO_SHOW_COMPLETED_WINDOW_DAYS } from '../../services/api/fines.api';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The player's live no-show mark on this match, if any. */
export function activeNoShow(noShows: readonly MatchNoShow[] | undefined, playerId: string): MatchNoShow | null {
  return (noShows ?? []).find((mark) => mark.playerId === playerId && !mark.undoneAt) ?? null;
}

export interface NoShowMatchFacts {
  status: MatchStatus;
  completedAt?: string;
  date?: string;
}

/**
 * Whether a GM can still mark a no-show: scheduled matches, and completed ones
 * for a week after the result (mirrors `noShowMarkRefusal` on the server).
 * With no result time known, the server decides.
 */
export function canMarkNoShow(match: NoShowMatchFacts, now: Date = new Date()): boolean {
  if (match.status === 'scheduled') return true;
  if (match.status !== 'completed') return false;
  const resultTime = Date.parse(match.completedAt ?? match.date ?? '');
  if (Number.isNaN(resultTime)) return true;
  return now.getTime() - resultTime <= NO_SHOW_COMPLETED_WINDOW_DAYS * DAY_MS;
}
