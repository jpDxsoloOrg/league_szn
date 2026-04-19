import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { Match } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

type FormResult = 'W' | 'L' | 'D';

function getResultForPlayer(
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

type CompletedMatchForForm = Pick<Match, 'participants' | 'winners' | 'losers' | 'isDraw' | 'updatedAt'>;

function computeRecentFormAndStreak(
  playerId: string,
  completedMatches: CompletedMatchForForm[]
): { recentForm: FormResult[]; currentStreak: { type: FormResult; count: number } } {
  const playerMatches = completedMatches
    .filter((m) => (m.participants || []).includes(playerId))
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt ?? 0).getTime();
      const bTime = new Date(b.updatedAt ?? 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 5);
  const recentForm: FormResult[] = playerMatches.map((m) => getResultForPlayer(playerId, m));
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

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { competition: { matches }, roster: { players, overalls }, season: { standings: seasonStandings } } = getRepositories();
    const seasonId = event.queryStringParameters?.seasonId;

    // Fetch overalls and matches in parallel
    const [overallItems, rawMatches] = await Promise.all([
      overalls.listAll(),
      matches.listCompleted(),
    ]);

    const overallsByPlayerId = new Map<string, number>(
      overallItems
        .filter(o => o.mainOverall !== undefined)
        .map(o => [o.playerId, o.mainOverall])
    );

    // Last 5 and streak: only matches with updatedAt (same as dashboard recent results), sort by updatedAt desc
    const completedMatches = rawMatches.filter((m) => m.updatedAt);

    if (seasonId) {
      // Get season-specific standings with pagination support
      const seasonStandingsList = await seasonStandings.listBySeason(seasonId);

      // Get all player details with pagination support
      const allPlayers = await players.list();

      // Only include players who have a wrestler assigned (exclude Fantasy-only users)
      const filteredPlayers = allPlayers.filter((p) => p.currentWrestler);

      // Build a map of season standings by playerId
      const standingsMap = new Map(
        seasonStandingsList.map((s) => [s.playerId, s])
      );

      // Show ALL players - those with standings get season W-L-D, others get 0-0-0
      const standings = filteredPlayers.map((player) => {
        const standing = standingsMap.get(player.playerId);
        const { recentForm, currentStreak } = computeRecentFormAndStreak(
          player.playerId,
          completedMatches
        );
        const mainOverall = overallsByPlayerId.get(player.playerId);
        return {
          ...player,
          wins: standing ? (standing.wins || 0) : 0,
          losses: standing ? (standing.losses || 0) : 0,
          draws: standing ? (standing.draws || 0) : 0,
          recentForm,
          currentStreak,
          ...(mainOverall !== undefined ? { mainOverall } : {}),
        };
      });

      // Sort by wins descending, then by losses ascending
      standings.sort((a, b) => {
        if (b.wins !== a.wins) {
          return b.wins - a.wins;
        }
        return a.losses - b.losses;
      });

      return success({
        players: standings,
        seasonId,
        sortedByWins: true,
      });
    }

    // Default: get all-time standings from Players table with pagination support
    const allPlayers = await players.list();

    // Only include players who have a wrestler assigned (exclude Fantasy-only users)
    const wrestlers = allPlayers.filter((p) => p.currentWrestler);

    // Sort players by wins descending, then by losses ascending
    const sortedPlayers = wrestlers.sort((a, b) => {
      const aWins = a.wins || 0;
      const bWins = b.wins || 0;
      const aLosses = a.losses || 0;
      const bLosses = b.losses || 0;

      if (bWins !== aWins) {
        return bWins - aWins;
      }
      return aLosses - bLosses;
    });

    const playersWithForm = sortedPlayers.map((player) => {
      const { recentForm, currentStreak } = computeRecentFormAndStreak(
        player.playerId,
        completedMatches
      );
      const mainOverall = overallsByPlayerId.get(player.playerId);
      return { ...player, recentForm, currentStreak, ...(mainOverall !== undefined ? { mainOverall } : {}) };
    });

    return success({
      players: playersWithForm,
      sortedByWins: true,
    });
  } catch (err) {
    console.error('Error fetching standings:', err);
    return serverError('Failed to fetch standings');
  }
};
