import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import {
  TagTeamRecord,
  FormResult,
  TagTeamMatchResult,
  fetchCompletedMatches,
  findTagTeamMatches,
  computeFormAndStreak,
} from './computeTagTeamStats';

interface PlayerSummary {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  imageUrl?: string;
  psnId?: string;
}

interface HeadToHeadRecord {
  opponentTagTeamId: string;
  opponentTagTeamName: string;
  wins: number;
  losses: number;
  draws: number;
}

interface MatchTypeRecord {
  matchFormat: string;
  wins: number;
  losses: number;
  draws: number;
}

interface RecentMatch {
  matchId: string;
  date: string;
  matchFormat?: string;
  result: FormResult;
  opponentPlayerIds: string[];
}

interface TagTeamStandingsInfo {
  winPercentage: number;
  recentForm: FormResult[];
  currentStreak: { type: FormResult; count: number };
}

function computeHeadToHead(
  teamMatches: TagTeamMatchResult[],
  activeTagTeams: TagTeamRecord[],
  currentTagTeamId: string
): HeadToHeadRecord[] {
  // Build a lookup: for each pair of opponent player IDs -> which tag team they belong to
  const pairToTeam = new Map<string, TagTeamRecord>();
  for (const team of activeTagTeams) {
    if (team.tagTeamId === currentTagTeamId) continue;
    const pairKey = [team.player1Id, team.player2Id].sort().join('|');
    pairToTeam.set(pairKey, team);
  }

  // For each match, check if opponent team is an active tag team
  const h2hMap = new Map<string, { wins: number; losses: number; draws: number }>();

  for (const { result, opponentTeamPlayerIds } of teamMatches) {
    // Check all pairs of opponents to find tag team matches
    const opponentPairKey = [...opponentTeamPlayerIds].sort().join('|');
    const opponentTeam = pairToTeam.get(opponentPairKey);
    if (!opponentTeam) continue;

    const existing = h2hMap.get(opponentTeam.tagTeamId) || { wins: 0, losses: 0, draws: 0 };
    if (result === 'W') existing.wins++;
    else if (result === 'L') existing.losses++;
    else existing.draws++;
    h2hMap.set(opponentTeam.tagTeamId, existing);
  }

  const records: HeadToHeadRecord[] = [];
  for (const [opponentTagTeamId, stats] of h2hMap.entries()) {
    const opponentTeam = activeTagTeams.find((t) => t.tagTeamId === opponentTagTeamId);
    records.push({
      opponentTagTeamId,
      opponentTagTeamName: opponentTeam?.name || 'Unknown',
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
    });
  }

  return records;
}

function computeMatchTypeBreakdown(teamMatches: TagTeamMatchResult[]): MatchTypeRecord[] {
  const formatMap = new Map<string, { wins: number; losses: number; draws: number }>();

  for (const { match, result } of teamMatches) {
    const format = match.matchFormat || match.matchType || 'Unknown';
    const existing = formatMap.get(format) || { wins: 0, losses: 0, draws: 0 };
    if (result === 'W') existing.wins++;
    else if (result === 'L') existing.losses++;
    else existing.draws++;
    formatMap.set(format, existing);
  }

  const records: MatchTypeRecord[] = [];
  for (const [matchFormat, stats] of formatMap.entries()) {
    records.push({ matchFormat, ...stats });
  }

  return records;
}

function buildRecentMatches(teamMatches: TagTeamMatchResult[], limit: number): RecentMatch[] {
  const sorted = [...teamMatches].sort((a, b) => {
    const aTime = new Date(a.match.updatedAt ?? a.match.date).getTime();
    const bTime = new Date(b.match.updatedAt ?? b.match.date).getTime();
    return bTime - aTime;
  });

  return sorted.slice(0, limit).map(({ match, result, opponentTeamPlayerIds }) => ({
    matchId: match.matchId,
    date: match.date,
    matchFormat: match.matchFormat || match.matchType,
    result,
    opponentPlayerIds: opponentTeamPlayerIds,
  }));
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const tagTeamId = event.pathParameters?.tagTeamId;
    if (!tagTeamId) {
      return badRequest('tagTeamId is required');
    }

    const { tagTeams: tagTeamsRepo, players: playersRepo } = getRepositories();

    const tagTeam = await tagTeamsRepo.findById(tagTeamId);
    if (!tagTeam) {
      return notFound('Tag team not found');
    }

    // Fetch player details, completed matches, and all active tag teams in parallel
    // Note: completedMatches uses dynamoDb directly — matches migration deferred to Wave 5+
    const [player1, player2, completedMatches, activeTagTeams] =
      await Promise.all([
        playersRepo.findById(tagTeam.player1Id),
        playersRepo.findById(tagTeam.player2Id),
        fetchCompletedMatches(),
        tagTeamsRepo.listByStatus('active'),
      ]);

    const player1Summary: PlayerSummary | null = player1
      ? {
          playerId: player1.playerId,
          playerName: player1.name,
          wrestlerName: player1.currentWrestler,
          imageUrl: player1.imageUrl,
          psnId: player1.psnId,
        }
      : null;

    const player2Summary: PlayerSummary | null = player2
      ? {
          playerId: player2.playerId,
          playerName: player2.name,
          wrestlerName: player2.currentWrestler,
          imageUrl: player2.imageUrl,
          psnId: player2.psnId,
        }
      : null;

    // Cast active tag teams to TagTeamRecord for computeHeadToHead
    const activeTagTeamRecords = activeTagTeams as unknown as TagTeamRecord[];

    // Find all matches where both members competed on the same team
    const teamMatches = findTagTeamMatches(
      completedMatches,
      tagTeam.player1Id,
      tagTeam.player2Id
    );

    // Compute standings info
    const totalMatches = tagTeam.wins + tagTeam.losses + tagTeam.draws;
    const winPercentage =
      totalMatches > 0
        ? Math.round((tagTeam.wins / totalMatches) * 1000) / 1000
        : 0;
    const { recentForm, currentStreak } = computeFormAndStreak(teamMatches, 10);
    const standings: TagTeamStandingsInfo = { winPercentage, recentForm, currentStreak };

    // Compute head-to-head records
    const headToHead = computeHeadToHead(teamMatches, activeTagTeamRecords, tagTeamId);

    // Compute match-type breakdown
    const matchTypeRecords = computeMatchTypeBreakdown(teamMatches);

    // Build recent matches list
    const recentMatches = buildRecentMatches(teamMatches, 10);

    return success({
      ...tagTeam,
      player1: player1Summary,
      player2: player2Summary,
      standings,
      headToHead,
      matchTypeRecords,
      recentMatches,
    });
  } catch (err) {
    console.error('Error fetching tag team:', err);
    return serverError('Failed to fetch tag team');
  }
};
