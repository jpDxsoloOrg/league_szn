import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.queryStringParameters?.seasonId;

    if (seasonId) {
      // Get season-specific standings
      const seasonStandingsResult = await dynamoDb.query({
        TableName: TableNames.SEASON_STANDINGS,
        KeyConditionExpression: 'seasonId = :seasonId',
        ExpressionAttributeValues: { ':seasonId': seasonId },
      });

      // Get player details for each standing
      const playersResult = await dynamoDb.scan({
        TableName: TableNames.PLAYERS,
      });

      const playersMap = new Map(
        (playersResult.Items || []).map((p) => [p.playerId, p])
      );

      // Merge player info with season standings
      const standings = (seasonStandingsResult.Items || []).map((standing) => {
        const player = playersMap.get(standing.playerId) || {};
        return {
          ...player,
          wins: standing.wins || 0,
          losses: standing.losses || 0,
          draws: standing.draws || 0,
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

    // Default: get all-time standings from Players table
    const result = await dynamoDb.scan({
      TableName: TableNames.PLAYERS,
    });

    // Sort players by wins descending, then by losses ascending
    const players = (result.Items || []).sort((a, b) => {
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }
      return a.losses - b.losses;
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
