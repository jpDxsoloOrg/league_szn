import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);

    const result = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': sub,
      },
    });

    if (!result.Items || result.Items.length === 0) {
      return notFound('No player profile found for this user');
    }

    const player = result.Items[0];
    const playerId = player.playerId as string;

    // Fetch season standings for this player via PlayerIndex GSI
    const seasonStandings = await dynamoDb.queryAll({
      TableName: TableNames.SEASON_STANDINGS,
      IndexName: 'PlayerIndex',
      KeyConditionExpression: 'playerId = :playerId',
      ExpressionAttributeValues: {
        ':playerId': playerId,
      },
    });

    // Fetch season details to get names
    let seasons: Record<string, unknown>[] = [];
    if (seasonStandings.length > 0) {
      seasons = await dynamoDb.scanAll({
        TableName: TableNames.SEASONS,
      });
    }

    const seasonsMap = new Map(
      seasons.map((s) => [s.seasonId as string, s])
    );

    // Build season records with season name
    const seasonRecords = seasonStandings.map((standing) => {
      const season = seasonsMap.get(standing.seasonId as string);
      return {
        seasonId: standing.seasonId,
        seasonName: (season?.name as string) || 'Unknown Season',
        seasonStatus: (season?.status as string) || 'unknown',
        wins: (standing.wins as number) || 0,
        losses: (standing.losses as number) || 0,
        draws: (standing.draws as number) || 0,
      };
    });

    return success({
      ...player,
      seasonRecords,
    });
  } catch (err) {
    console.error('Error fetching player profile:', err);
    return serverError('Failed to fetch player profile');
  }
};
