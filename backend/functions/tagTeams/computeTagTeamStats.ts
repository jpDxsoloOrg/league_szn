import { getRepositories } from '../../lib/repositories';
import {
  computeRecentFormAndStreak,
  type FormResult as SharedFormResult,
} from '../../lib/stats/recentFormAndStreak';
import { tallyResults, type WinLossDrawRecord } from '../../lib/stats/record';
import { resolveBilledName } from '../../lib/needsWrestler';
import { normalizeCalendarDate } from '../../lib/calendarDate';

export type FormResult = SharedFormResult;

export interface MatchRecord {
  matchId: string;
  date: string;
  matchFormat?: string;
  matchType?: string;
  participants: string[];
  teams?: string[][];
  winners?: string[];
  losers?: string[];
  isDraw?: boolean;
  isChampionship: boolean;
  championshipId?: string;
  status: string;
  seasonId?: string;
  updatedAt?: string;
}

export interface TagTeamRecord {
  [key: string]: unknown;
  tagTeamId: string;
  name: string;
  player1Id: string;
  player2Id: string;
  imageUrl?: string;
  status: string;
  wins: number;
  losses: number;
  draws: number;
  createdAt: string;
  updatedAt: string;
  dissolvedAt?: string;
}

/** The parts of a team that decide which matches belong to it. */
export type TagTeamLifetime = Pick<
  TagTeamRecord,
  'player1Id' | 'player2Id' | 'createdAt' | 'dissolvedAt'
>;

export interface TagTeamMatchResult {
  match: MatchRecord;
  result: FormResult;
  opponentTeamPlayerIds: string[];
}

/**
 * Checks if both members of a tag team are in the same team sub-array.
 * Returns the index of the team sub-array they share, or -1 if not found.
 */
function findTeamIndex(teams: string[][], player1Id: string, player2Id: string): number {
  for (let i = 0; i < teams.length; i++) {
    if (teams[i].includes(player1Id) && teams[i].includes(player2Id)) {
      return i;
    }
  }
  return -1;
}

/**
 * Determines the result of a match for a tag team based on winners/losers/isDraw.
 */
function getTagTeamResult(
  match: MatchRecord,
  player1Id: string,
  player2Id: string
): FormResult {
  if (match.isDraw) return 'D';
  const winners = match.winners || [];
  if (winners.includes(player1Id) || winners.includes(player2Id)) return 'W';
  const losers = match.losers || [];
  if (losers.includes(player1Id) || losers.includes(player2Id)) return 'L';
  return 'D';
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * True when a match falls within the team's lifetime, both end days included.
 * Compares calendar days because a match booked on an event carries the date
 * alone, which would otherwise sort before a team formed earlier that day.
 * createdAt is a UTC time, so a team formed on a US evening carries the next
 * day. A date-only match has no time to compare, so it gets one day of grace.
 * A date that cannot be read sets no limit.
 */
function isWithinTeamLifetime(matchDate: string, team: TagTeamLifetime): boolean {
  const matchDay = normalizeCalendarDate(matchDate);
  if (!matchDay) return true;
  const formedDay = normalizeCalendarDate(team.createdAt);
  const firstDay = formedDay && matchDate.length === formedDay.length
    ? new Date(Date.parse(formedDay) - MS_PER_DAY).toISOString().slice(0, 10)
    : formedDay;
  const lastDay = normalizeCalendarDate(team.dissolvedAt);
  return (!firstDay || matchDay >= firstDay) && (!lastDay || matchDay <= lastDay);
}

/**
 * Scans all completed matches and finds those where a given tag team's
 * members competed together on the same team while that team existed.
 */
export function findTagTeamMatches(
  completedMatches: MatchRecord[],
  team: TagTeamLifetime
): TagTeamMatchResult[] {
  const { player1Id, player2Id } = team;
  const results: TagTeamMatchResult[] = [];

  for (const match of completedMatches) {
    if (!match.teams || match.teams.length === 0) continue;
    if (!isWithinTeamLifetime(match.date, team)) continue;

    const teamIdx = findTeamIndex(match.teams, player1Id, player2Id);
    if (teamIdx === -1) continue;

    const result = getTagTeamResult(match, player1Id, player2Id);

    // Collect opponent player IDs from other teams
    const opponentTeamPlayerIds: string[] = [];
    for (let i = 0; i < match.teams.length; i++) {
      if (i !== teamIdx) {
        opponentTeamPlayerIds.push(...match.teams[i]);
      }
    }

    results.push({ match, result, opponentTeamPlayerIds });
  }

  return results;
}

/**
 * Computes recent form (last N results) and current streak.
 */
export function computeFormAndStreak(
  matchResults: TagTeamMatchResult[],
  limit: number
): { recentForm: FormResult[]; currentStreak: { type: FormResult; count: number } } {
  const sorted = [...matchResults].sort((a, b) => {
    const aTime = new Date(a.match.updatedAt ?? a.match.date).getTime();
    const bTime = new Date(b.match.updatedAt ?? b.match.date).getTime();
    return bTime - aTime;
  });

  return computeRecentFormAndStreak(sorted.map((r) => r.result), limit);
}

/**
 * A team's record from the matches its members fought together. Every tag team
 * response uses this, so the record agrees with the streak and match breakdown
 * shown beside it. The stored wins/losses/draws counters are not read for display.
 */
export function computeTagTeamRecord(
  matchResults: ReadonlyArray<TagTeamMatchResult>,
): WinLossDrawRecord {
  return tallyResults(matchResults.map((r) => r.result));
}

/**
 * Name of a team member for lists: the player's name, then the wrestler name
 * stored on the team, which outlives a deleted player row.
 */
export function resolveMemberName(
  player: { name?: string | null } | undefined,
  storedWrestlerName: string | undefined,
): string {
  return player?.name?.trim() || resolveBilledName(storedWrestlerName, null, 'Unknown');
}

/**
 * Fetches all completed matches via the matches repository.
 */
export async function fetchCompletedMatches(): Promise<MatchRecord[]> {
  const { competition: { matches } } = getRepositories();
  const items = await matches.listCompleted();
  return items as unknown as MatchRecord[];
}

/**
 * Builds a map of tagTeamId -> TagTeamMatchResult[] for all provided tag teams.
 */
export function buildTagTeamMatchMap(
  tagTeams: TagTeamRecord[],
  completedMatches: MatchRecord[]
): Map<string, TagTeamMatchResult[]> {
  const map = new Map<string, TagTeamMatchResult[]>();

  // Pre-filter matches that have teams
  const teamMatches = completedMatches.filter(
    (m) => m.teams && m.teams.length > 0
  );

  for (const team of tagTeams) {
    const results = findTagTeamMatches(teamMatches, team);
    map.set(team.tagTeamId, results);
  }

  return map;
}
