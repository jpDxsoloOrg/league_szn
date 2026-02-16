import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

type FormResult = 'W' | 'L' | 'D';

function getResultForPlayer(
  playerId: string,
  match: { participants?: string[]; winners?: string[]; losers?: string[] }
): FormResult {
  const participants = (match.participants || []) as string[];
  const winners = (match.winners || []) as string[];
  const losers = (match.losers || []) as string[];
  if (!participants.includes(playerId)) return 'D';
  if (winners.includes(playerId)) return 'W';
  if (losers.includes(playerId)) return 'L';
  return 'D';
}

function computeRecentFormAndStreak(
  playerId: string,
  completedMatches: { date: string; participants?: string[]; winners?: string[]; losers?: string[] }[]
): { recentForm: FormResult[]; currentStreak: { type: FormResult; count: number } } {
  const playerMatches = completedMatches
    .filter((m) => ((m.participants || []) as string[]).includes(playerId))
    .sort((a, b) => (b.date as string).localeCompare(a.date as string))
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
    const seasonId = event.queryStringParameters?.seasonId;

    const completedMatches = await dynamoDb.scanAll({
      TableName: TableNames.MATCHES,
      FilterExpression: '#status = :completed',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':completed': 'completed' },
    });

    if (seasonId) {
      // Get season-specific standings with pagination support
      const seasonStandings = await dynamoDb.queryAll({
        TableName: TableNames.SEASON_STANDINGS,
        KeyConditionExpression: 'seasonId = :seasonId',
        ExpressionAttributeValues: { ':seasonId': seasonId },
      });

      // Get all player details with pagination support
      const players = await dynamoDb.scanAll({
        TableName: TableNames.PLAYERS,
      });

      // Build a map of season standings by playerId
      const standingsMap = new Map(
        seasonStandings.map((s) => [s.playerId as string, s])
      );

      // Show ALL players - those with standings get season W-L-D, others get 0-0-0
      const standings = players.map((player) => {
        const standing = standingsMap.get(player.playerId as string);
        const { recentForm, currentStreak } = computeRecentFormAndStreak(
          player.playerId as string,
          completedMatches
        );
        return {
          ...player,
          wins: standing ? ((standing.wins as number) || 0) : 0,
          losses: standing ? ((standing.losses as number) || 0) : 0,
          draws: standing ? ((standing.draws as number) || 0) : 0,
          recentForm,
          currentStreak,
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
    const allPlayers = await dynamoDb.scanAll({
      TableName: TableNames.PLAYERS,
    });

    // Sort players by wins descending, then by losses ascending
    const players = allPlayers.sort((a, b) => {
      const aWins = (a.wins as number) || 0;
      const bWins = (b.wins as number) || 0;
      const aLosses = (a.losses as number) || 0;
      const bLosses = (b.losses as number) || 0;

      if (bWins !== aWins) {
        return bWins - aWins;
      }
      return aLosses - bLosses;
    });

    const playersWithForm = players.map((player) => {
      const { recentForm, currentStreak } = computeRecentFormAndStreak(
        player.playerId as string,
        completedMatches
      );
      return { ...player, recentForm, currentStreak };
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
