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

export type CompletedMatchForForm = Pick<Match, 'participants' | 'winners' | 'losers' | 'isDraw' | 'updatedAt'>;

export function computeRecentFormAndStreak(
  playerId: string,
  completedMatches: CompletedMatchForForm[]
): FormAndStreak {
  // Rows with no updatedAt can't be ordered, so they're left out — the same
  // rule getStandings applies; keeping it here means every caller agrees.
  const resultsNewestFirst = completedMatches
    .filter((m) => m.updatedAt && (m.participants || []).includes(playerId))
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt ?? 0).getTime();
      const bTime = new Date(b.updatedAt ?? 0).getTime();
      return bTime - aTime;
    })
    .map((m) => getResultForPlayer(playerId, m));
  // The form window is capped; the streak runs over every result.
  return computeFromResults(resultsNewestFirst, RECENT_FORM_LIMIT);
}
