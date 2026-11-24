import type { Match } from './repositories';
import { matchResultTime } from './matchTime';
import { computeRecentFormAndStreak, getResultForPlayer, type CompletedMatchForForm } from './recentForm';
import type { FormAndStreak } from './stats/recentFormAndStreak';

export type MatchForDivisionRecord = CompletedMatchForForm & Pick<Match, 'completedAt'>;

export interface DivisionRecord extends FormAndStreak {
  wins: number;
  losses: number;
  draws: number;
  /** When the player joined their current division; omitted when never recorded. */
  since?: string;
}

/**
 * A player's record in their current division (PRL-09): only results that
 * landed on or after `divisionJoinedAt` count, so a promoted or relegated
 * wrestler starts the new table at 0-0-0. Callers pass the completed matches
 * already narrowed to the window they show (all-time or one season).
 */
export function computeDivisionRecord(
  playerId: string,
  divisionJoinedAt: string,
  completedMatches: ReadonlyArray<MatchForDivisionRecord>,
): DivisionRecord {
  const joinedAtMs = new Date(divisionJoinedAt).getTime();
  const matchesSinceJoining = completedMatches.filter(
    (match) =>
      (match.participants || []).includes(playerId) &&
      new Date(matchResultTime(match)).getTime() >= joinedAtMs,
  );

  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const match of matchesSinceJoining) {
    const result = getResultForPlayer(playerId, match);
    if (result === 'W') wins++;
    else if (result === 'L') losses++;
    else draws++;
  }

  return {
    wins,
    losses,
    draws,
    ...computeRecentFormAndStreak(playerId, matchesSinceJoining),
    since: divisionJoinedAt,
  };
}

/** The join time to bound a division record by, or undefined when missing or unparseable. */
export function divisionRecordLowerBound(divisionJoinedAt: unknown): string | undefined {
  if (typeof divisionJoinedAt !== 'string' || divisionJoinedAt === '') return undefined;
  return Number.isNaN(new Date(divisionJoinedAt).getTime()) ? undefined : divisionJoinedAt;
}
