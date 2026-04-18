import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getRepositories } from '../../lib/repositories';
import { success, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);

    const player = await getRepositories().players.findByUserId(sub);

    if (!player) {
      return notFound('No player profile found for this user');
    }

    const playerId = player.playerId;

    // Fetch all seasons
    const seasons = await getRepositories().seasons.list();

    // Fetch season standings for this player via PlayerIndex GSI
    // Note: SeasonStandings repo not yet migrated
    const seasonStandings = await dynamoDb.queryAll({
      TableName: TableNames.SEASON_STANDINGS,
      IndexName: 'PlayerIndex',
      KeyConditionExpression: 'playerId = :playerId',
      ExpressionAttributeValues: {
        ':playerId': playerId,
      },
    });

    // Build a map of standings by seasonId
    const standingsMap = new Map(
      seasonStandings.map((s) => [s.seasonId as string, s])
    );

    // Show ALL seasons - those with standings get W-L-D, others get 0-0-0
    const seasonRecords = seasons.map((season) => {
      const standing = standingsMap.get(season.seasonId as string);
      return {
        seasonId: season.seasonId,
        seasonName: (season.name as string) || 'Unknown Season',
        seasonStatus: (season.status as string) || 'unknown',
        wins: standing ? ((standing.wins as number) || 0) : 0,
        losses: standing ? ((standing.losses as number) || 0) : 0,
        draws: standing ? ((standing.draws as number) || 0) : 0,
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
