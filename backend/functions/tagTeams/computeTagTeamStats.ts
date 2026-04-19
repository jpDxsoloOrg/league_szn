import { getRepositories } from '../../lib/repositories';

export type FormResult = 'W' | 'L' | 'D';

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

/**
 * Scans all completed matches and finds those where a given tag team's
 * members competed together on the same team.
 */
export function findTagTeamMatches(
  completedMatches: MatchRecord[],
  player1Id: string,
  player2Id: string
): TagTeamMatchResult[] {
  const results: TagTeamMatchResult[] = [];

  for (const match of completedMatches) {
    if (!match.teams || match.teams.length === 0) continue;

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

  const recentForm: FormResult[] = sorted.slice(0, limit).map((r) => r.result);

  if (recentForm.length === 0) {
    return { recentForm: [], currentStreak: { type: 'W', count: 0 } };
  }

  const first = recentForm[0];
  let count = 0;
  for (const r of recentForm) {
    if (r !== first) break;
    count++;
  }

  return { recentForm, currentStreak: { type: first, count } };
}

/**
 * Fetches all completed matches via the matches repository.
 */
export async function fetchCompletedMatches(): Promise<MatchRecord[]> {
  const { matches } = getRepositories();
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
    const results = findTagTeamMatches(teamMatches, team.player1Id, team.player2Id);
    map.set(team.tagTeamId, results);
  }

  return map;
}
