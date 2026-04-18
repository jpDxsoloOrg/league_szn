import { getRepositories } from '../../lib/repositories';

/** A completed match record from DynamoDB */
export interface MatchRecord {
  matchId: string;
  date: string;
  matchFormat?: string;
  participants: string[];
  winners: string[];
  losers: string[];
  isDraw?: boolean;
  status: string;
  teams?: string[][];
  isChampionship?: boolean;
  championshipId?: string;
  tournamentId?: string;
  seasonId?: string;
  stipulation?: string;
}

/** A stable record from DynamoDB */
export interface StableRecord {
  stableId: string;
  name: string;
  leaderId: string;
  memberIds: string[];
  status: string;
  imageUrl?: string;
  wins: number;
  losses: number;
  draws: number;
  createdAt: string;
  updatedAt: string;
  disbandedAt?: string;
}

export type MatchOutcome = 'W' | 'L' | 'D';

export interface StableMatchResult {
  matchId: string;
  date: string;
  matchFormat: string;
  outcome: MatchOutcome;
  opponentStableIds: string[];
}

export interface HeadToHeadRecord {
  opponentStableId: string;
  opponentStableName: string;
  wins: number;
  losses: number;
  draws: number;
}

export interface MatchTypeRecord {
  matchFormat: string;
  wins: number;
  losses: number;
  draws: number;
}

export interface StableStandingsData {
  winPercentage: number;
  recentForm: string[];
  currentStreak: string;
}

/**
 * Fetches all completed matches via the matches repository.
 */
export async function fetchCompletedMatches(): Promise<MatchRecord[]> {
  const { matches } = getRepositories();
  const items = await matches.listCompleted();

  return items.map((item) => ({
    matchId: item.matchId,
    date: item.date,
    matchFormat: item.matchFormat || item.matchType || 'unknown',
    participants: item.participants || [],
    winners: item.winners || [],
    losers: item.losers || [],
    isDraw: item.isDraw,
    status: item.status,
    teams: item.teams,
    isChampionship: item.isChampionship,
    championshipId: item.championshipId,
    tournamentId: item.tournamentId,
    seasonId: item.seasonId,
    stipulation: item.stipulationId,
  }));
}

/**
 * Fetches all active stables via the stables repository.
 */
export async function fetchActiveStables(): Promise<StableRecord[]> {
  const { stables } = getRepositories();
  const allStables = await stables.list();

  return allStables
    .filter((s) => s.status === 'active' || s.status === 'approved')
    .map((item) => ({
      stableId: item.stableId,
      name: item.name,
      leaderId: item.leaderId,
      memberIds: item.memberIds || [],
      status: item.status,
      imageUrl: item.imageUrl,
      wins: item.wins || 0,
      losses: item.losses || 0,
      draws: item.draws || 0,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      disbandedAt: item.disbandedAt,
    }));
}

/**
 * Builds a reverse lookup from playerId to stableId.
 */
export function buildPlayerToStableMap(stables: StableRecord[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const stable of stables) {
    for (const playerId of stable.memberIds) {
      map.set(playerId, stable.stableId);
    }
  }
  return map;
}

/**
 * Determines the outcome of a match for a given stable based on its member participation.
 * Returns null if the stable has no members in the match.
 */
export function determineStableOutcome(
  match: MatchRecord,
  stableMemberIds: Set<string>
): MatchOutcome | null {
  const hasParticipant = match.participants.some((pid) => stableMemberIds.has(pid));
  if (!hasParticipant) return null;

  if (match.isDraw) return 'D';

  const hasWinner = match.winners.some((pid) => stableMemberIds.has(pid));
  const hasLoser = match.losers.some((pid) => stableMemberIds.has(pid));

  // If members are on both sides (rare: different stable members opposing), skip
  if (hasWinner && hasLoser) return null;
  if (hasWinner) return 'W';
  if (hasLoser) return 'L';

  return null;
}

/**
 * Computes match results for a single stable from all completed matches.
 * Returns results sorted by date descending.
 */
export function computeStableMatchResults(
  matches: MatchRecord[],
  stable: StableRecord,
  playerToStable: Map<string, string>
): StableMatchResult[] {
  const memberSet = new Set(stable.memberIds);
  const results: StableMatchResult[] = [];

  for (const match of matches) {
    const outcome = determineStableOutcome(match, memberSet);
    if (outcome === null) continue;

    // Find opponent stables
    const opponentStableIds = new Set<string>();
    for (const pid of match.participants) {
      if (!memberSet.has(pid)) {
        const oppStableId = playerToStable.get(pid);
        if (oppStableId && oppStableId !== stable.stableId) {
          opponentStableIds.add(oppStableId);
        }
      }
    }

    results.push({
      matchId: match.matchId,
      date: match.date,
      matchFormat: match.matchFormat || 'unknown',
      outcome,
      opponentStableIds: Array.from(opponentStableIds),
    });
  }

  // Sort by date descending
  results.sort((a, b) => b.date.localeCompare(a.date));
  return results;
}

/**
 * Computes recentForm (last N results) and currentStreak from match results.
 * Results must be sorted by date descending already.
 */
export function computeFormAndStreak(
  results: StableMatchResult[],
  formCount: number = 10
): { recentForm: string[]; currentStreak: string } {
  const recentForm = results.slice(0, formCount).map((r) => r.outcome);

  let currentStreak = '';
  if (results.length > 0) {
    const firstOutcome = results[0].outcome;
    let streakCount = 0;
    for (const result of results) {
      if (result.outcome === firstOutcome) {
        streakCount++;
      } else {
        break;
      }
    }
    currentStreak = `${firstOutcome}${streakCount}`;
  }

  return { recentForm, currentStreak };
}

/**
 * Computes head-to-head records for a stable against all other stables.
 */
export function computeHeadToHead(
  results: StableMatchResult[],
  stableNameMap: Map<string, string>
): HeadToHeadRecord[] {
  const h2hMap = new Map<string, { wins: number; losses: number; draws: number }>();

  for (const result of results) {
    for (const oppId of result.opponentStableIds) {
      if (!h2hMap.has(oppId)) {
        h2hMap.set(oppId, { wins: 0, losses: 0, draws: 0 });
      }
      const record = h2hMap.get(oppId)!;
      if (result.outcome === 'W') record.wins++;
      else if (result.outcome === 'L') record.losses++;
      else record.draws++;
    }
  }

  const records: HeadToHeadRecord[] = [];
  for (const [oppId, record] of h2hMap) {
    records.push({
      opponentStableId: oppId,
      opponentStableName: stableNameMap.get(oppId) || 'Unknown',
      wins: record.wins,
      losses: record.losses,
      draws: record.draws,
    });
  }

  return records.sort((a, b) => b.wins - a.wins || a.losses - b.losses);
}

/**
 * Computes match-type breakdown for a stable.
 */
export function computeMatchTypeRecords(results: StableMatchResult[]): MatchTypeRecord[] {
  const typeMap = new Map<string, { wins: number; losses: number; draws: number }>();

  for (const result of results) {
    const format = result.matchFormat;
    if (!typeMap.has(format)) {
      typeMap.set(format, { wins: 0, losses: 0, draws: 0 });
    }
    const record = typeMap.get(format)!;
    if (result.outcome === 'W') record.wins++;
    else if (result.outcome === 'L') record.losses++;
    else record.draws++;
  }

  const records: MatchTypeRecord[] = [];
  for (const [format, record] of typeMap) {
    records.push({
      matchFormat: format,
      wins: record.wins,
      losses: record.losses,
      draws: record.draws,
    });
  }

  return records.sort((a, b) => (b.wins + b.losses + b.draws) - (a.wins + a.losses + a.draws));
}

/**
 * Computes win percentage from W/L/D counts.
 */
export function computeWinPercentage(wins: number, losses: number, draws: number): number {
  const total = wins + losses + draws;
  return total > 0 ? Math.round((wins / total) * 1000) / 1000 : 0;
}
