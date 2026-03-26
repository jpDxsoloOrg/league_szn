import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, getOrNotFound } from '../../lib/dynamodb';
import { success, badRequest, serverError } from '../../lib/response';
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

    const result = await getOrNotFound<TagTeamRecord>(
      TableNames.TAG_TEAMS,
      { tagTeamId },
      'Tag team not found'
    );

    if ('notFoundResponse' in result) {
      return result.notFoundResponse;
    }

    const tagTeam = result.item;

    // Fetch player details, completed matches, and all active tag teams in parallel
    const [player1Result, player2Result, completedMatches, activeTagTeamItems] =
      await Promise.all([
        dynamoDb.get({
          TableName: TableNames.PLAYERS,
          Key: { playerId: tagTeam.player1Id },
        }),
        dynamoDb.get({
          TableName: TableNames.PLAYERS,
          Key: { playerId: tagTeam.player2Id },
        }),
        fetchCompletedMatches(),
        dynamoDb.queryAll({
          TableName: TableNames.TAG_TEAMS,
          IndexName: 'StatusIndex',
          KeyConditionExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': 'active' },
        }),
      ]);

    const player1: PlayerSummary | null = player1Result.Item
      ? {
          playerId: player1Result.Item.playerId as string,
          playerName: player1Result.Item.name as string,
          wrestlerName: player1Result.Item.currentWrestler as string,
          imageUrl: player1Result.Item.imageUrl as string | undefined,
          psnId: player1Result.Item.psnId as string | undefined,
        }
      : null;

    const player2: PlayerSummary | null = player2Result.Item
      ? {
          playerId: player2Result.Item.playerId as string,
          playerName: player2Result.Item.name as string,
          wrestlerName: player2Result.Item.currentWrestler as string,
          imageUrl: player2Result.Item.imageUrl as string | undefined,
          psnId: player2Result.Item.psnId as string | undefined,
        }
      : null;

    const activeTagTeams = activeTagTeamItems as unknown as TagTeamRecord[];

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
    const headToHead = computeHeadToHead(teamMatches, activeTagTeams, tagTeamId);

    // Compute match-type breakdown
    const matchTypeRecords = computeMatchTypeBreakdown(teamMatches);

    // Build recent matches list
    const recentMatches = buildRecentMatches(teamMatches, 10);

    return success({
      ...tagTeam,
      player1,
      player2,
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
