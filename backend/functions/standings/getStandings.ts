import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.queryStringParameters?.seasonId;

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

      const playersMap = new Map(
        players.map((p) => [p.playerId, p])
      );

      // Merge player info with season standings
      const standings = seasonStandings.map((standing) => {
        const player = playersMap.get(standing.playerId as string) || {};
        return {
          ...player,
          wins: (standing.wins as number) || 0,
          losses: (standing.losses as number) || 0,
          draws: (standing.draws as number) || 0,
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

    return success({
      players,
      sortedByWins: true,
    });
  } catch (err) {
    console.error('Error fetching standings:', err);
    return serverError('Failed to fetch standings');
  }
};
