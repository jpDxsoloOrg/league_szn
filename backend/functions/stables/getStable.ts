import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import {
  StableRecord,
  MatchRecord,
  fetchActiveStables,
  fetchCompletedMatches,
  buildPlayerToStableMap,
  computeStableMatchResults,
  computeFormAndStreak,
  computeHeadToHead,
  computeMatchTypeRecords,
  computeWinPercentage,
} from './computeStableStats';

interface PlayerSummary {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  imageUrl?: string;
  psnId?: string;
  wins: number;
  losses: number;
  draws: number;
}

interface RecentMatch {
  matchId: string;
  date: string;
  matchFormat: string;
  outcome: string;
  participants: string[];
  winners: string[];
  losers: string[];
  isDraw: boolean;
  stipulation?: string;
  isChampionship?: boolean;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const stableId = event.pathParameters?.stableId;
    if (!stableId) {
      return badRequest('stableId is required');
    }

    const { roster: { stables: stablesRepo, players: playersRepo } } = getRepositories();

    const stable = await stablesRepo.findById(stableId);
    if (!stable) {
      return notFound('Stable not found');
    }

    // Fetch members via repo, all stables and completed matches in parallel
    // Note: fetchActiveStables and fetchCompletedMatches use dynamoDb directly — matches migration deferred to Wave 5+
    const memberPromises = (stable.memberIds || []).map((playerId) =>
      playersRepo.findById(playerId)
    );

    const [memberResults, allStables, matches] = await Promise.all([
      Promise.all(memberPromises),
      fetchActiveStables(),
      fetchCompletedMatches(),
    ]);

    // Build member list
    const members: PlayerSummary[] = [];
    let leaderName = '';

    for (const player of memberResults) {
      if (player) {
        const summary: PlayerSummary = {
          playerId: player.playerId,
          playerName: player.name,
          wrestlerName: player.currentWrestler,
          imageUrl: player.imageUrl,
          psnId: player.psnId,
          wins: player.wins || 0,
          losses: player.losses || 0,
          draws: player.draws || 0,
        };
        members.push(summary);

        if (player.playerId === stable.leaderId) {
          leaderName = player.name;
        }
      }
    }

    // Build maps for stats computation
    const playerToStable = buildPlayerToStableMap(allStables);
    const stableNameMap = new Map<string, string>();
    for (const s of allStables) {
      stableNameMap.set(s.stableId, s.name);
    }

    // Cast stable to the expected type for computation
    const stableForCompute: StableRecord = {
      stableId: stable.stableId,
      name: stable.name,
      leaderId: stable.leaderId,
      memberIds: stable.memberIds || [],
      status: stable.status,
      imageUrl: stable.imageUrl,
      wins: stable.wins || 0,
      losses: stable.losses || 0,
      draws: stable.draws || 0,
      createdAt: stable.createdAt,
      updatedAt: stable.updatedAt,
      disbandedAt: stable.disbandedAt,
    };

    // Compute all stats
    const matchResults = computeStableMatchResults(matches, stableForCompute, playerToStable);
    const { recentForm, currentStreak } = computeFormAndStreak(matchResults, 10);
    const headToHead = computeHeadToHead(matchResults, stableNameMap);
    const matchTypeRecords = computeMatchTypeRecords(matchResults);

    // Compute W/L/D from actual match data
    let computedWins = 0;
    let computedLosses = 0;
    let computedDraws = 0;
    for (const r of matchResults) {
      if (r.outcome === 'W') computedWins++;
      else if (r.outcome === 'L') computedLosses++;
      else computedDraws++;
    }

    const standings = {
      winPercentage: computeWinPercentage(computedWins, computedLosses, computedDraws),
      recentForm,
      currentStreak,
    };

    // Build recent matches (last 10)
    const memberSet = new Set(stable.memberIds || []);
    const recentMatches = buildRecentMatches(matches, memberSet, 10);

    return success({
      ...stable,
      members,
      leaderName,
      headToHead,
      matchTypeRecords,
      standings,
      recentMatches,
    });
  } catch (err) {
    console.error('Error fetching stable:', err);
    return serverError('Failed to fetch stable');
  }
};

function buildRecentMatches(
  matches: MatchRecord[],
  memberSet: Set<string>,
  limit: number
): RecentMatch[] {
  const relevant: RecentMatch[] = [];

  for (const match of matches) {
    const hasParticipant = match.participants.some((pid) => memberSet.has(pid));
    if (!hasParticipant) continue;

    let outcome: string;
    if (match.isDraw) {
      outcome = 'D';
    } else if (match.winners.some((pid) => memberSet.has(pid))) {
      outcome = 'W';
    } else if (match.losers.some((pid) => memberSet.has(pid))) {
      outcome = 'L';
    } else {
      outcome = 'unknown';
    }

    relevant.push({
      matchId: match.matchId,
      date: match.date,
      matchFormat: match.matchFormat || 'unknown',
      outcome,
      participants: match.participants,
      winners: match.winners,
      losers: match.losers,
      isDraw: match.isDraw === true,
      stipulation: match.stipulation,
      isChampionship: match.isChampionship,
    });
  }

  // Sort by date descending and take limit
  relevant.sort((a, b) => b.date.localeCompare(a.date));
  return relevant.slice(0, limit);
}
