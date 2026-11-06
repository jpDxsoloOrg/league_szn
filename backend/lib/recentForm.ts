import type { Match } from './repositories';
import {
  computeRecentFormAndStreak as computeFromResults,
  type FormAndStreak,
  type FormResult,
} from './stats/recentFormAndStreak';

export type { FormResult };

const RECENT_FORM_LIMIT = 5;

export function getResultForPlayer(
  playerId: string,
  match: { participants: string[]; winners?: string[]; losers?: string[]; isDraw?: boolean }
): FormResult {
  const participants = match.participants || [];
  if (!participants.includes(playerId)) return 'D';
  if (match.isDraw) return 'D';
  const winners = match.winners || [];
  const losers = match.losers || [];
  if (winners.includes(playerId)) return 'W';
  if (losers.includes(playerId)) return 'L';
  return 'D';
}

export type CompletedMatchForForm = Pick<Match, 'date' | 'participants' | 'winners' | 'losers' | 'isDraw' | 'updatedAt'>;

/**
 * Newest match first, by match date. updatedAt only breaks ties within a date:
 * a rating, Match of the Night or a slot edit bumps it on any completed match,
 * however old, so ordering on it would make an old result read as the latest.
 */
export function compareMatchesNewestFirst(
  a: { date: string; updatedAt?: string },
  b: { date: string; updatedAt?: string },
): number {
  return (
    new Date(b.date).getTime() - new Date(a.date).getTime() ||
    (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  );
}

export function computeRecentFormAndStreak(
  playerId: string,
  completedMatches: CompletedMatchForForm[]
): FormAndStreak {
  // Rows with no updatedAt can't be ordered, so they're left out — the same
  // rule getStandings applies; keeping it here means every caller agrees.
  const resultsNewestFirst = completedMatches
    .filter((m) => m.updatedAt && (m.participants || []).includes(playerId))
    .sort(compareMatchesNewestFirst)
    .map((m) => getResultForPlayer(playerId, m));
  // The form window is capped; the streak runs over every result.
  return computeFromResults(resultsNewestFirst, RECENT_FORM_LIMIT);
}
