import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, notFound, serverError } from '../../lib/response';

interface MatchRecord {
  matchId: string;
  date: string;
  matchFormat?: string;
  matchType?: string;
  participants: string[];
  winners?: string[];
  losers?: string[];
  isChampionship: boolean;
  status: string;
  seasonId?: string;
}

function getMatchCategory(match: MatchRecord): string {
  const mt = (match.matchFormat || match.matchType || 'singles').toLowerCase();
  if (mt.includes('tag')) return 'tag';
  if (mt.includes('ladder')) return 'ladder';
  if (mt.includes('cage') || mt.includes('cell') || mt.includes('hiac')) return 'cage';
  if (mt.includes('tlc')) return 'tlc';
  if (mt.includes('royal') || mt.includes('rumble')) return 'royalRumble';
  if (mt.includes('table')) return 'tables';
  return 'singles';
}

function computeStatsForType(
  matches: MatchRecord[],
  playerId: string,
): {
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  winPercentage: number;
} {
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const match of matches) {
    if (match.winners?.includes(playerId)) {
      wins++;
    } else if (match.losers?.includes(playerId)) {
      losses++;
    } else {
      draws++;
    }
  }

  const matchesPlayed = wins + losses + draws;
  const winPercentage = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 1000) / 10 : 0;

  return { wins, losses, draws, matchesPlayed, winPercentage };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) {
      return notFound('Player ID is required');
    }

    const seasonId = event.queryStringParameters?.seasonId;

    const { roster: { players }, competition: { matches } } = getRepositories();

    // Verify player exists
    const player = await players.findById(playerId);

    if (!player) {
      return notFound('Player not found');
    }

    // Get all completed matches
    const allMatches = await matches.listCompleted() as unknown as MatchRecord[];

    // Filter to player's matches and optionally by season
    let playerMatches = allMatches.filter((m) => m.participants.includes(playerId));
    if (seasonId) {
      playerMatches = playerMatches.filter((m) => m.seasonId === seasonId);
    }

    // Group matches by type
    const matchesByType: Record<string, MatchRecord[]> = {};
    for (const match of playerMatches) {
      const category = getMatchCategory(match);
      if (!matchesByType[category]) matchesByType[category] = [];
      matchesByType[category].push(match);
    }

    // Compute overall stats
    const overall = computeStatsForType(playerMatches, playerId);

    // Compute per-type stats
    const byMatchType: Record<string, ReturnType<typeof computeStatsForType>> = {};
    for (const [matchType, typeMatches] of Object.entries(matchesByType)) {
      byMatchType[matchType] = computeStatsForType(typeMatches, playerId);
    }

    return success({
      playerId: player.playerId,
      playerName: player.name,
      wrestlerName: player.currentWrestler,
      overall,
      byMatchType,
      ...(seasonId ? { seasonId } : {}),
    });
  } catch (err) {
    console.error('Error fetching player statistics:', err);
    return serverError('Failed to fetch player statistics');
  }
};
