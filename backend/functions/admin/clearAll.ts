import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

const deleteAllFromTable = async (tableName: string, keyName: string, sortKeyName?: string) => {
  const result = await dynamoDb.scan({
    TableName: tableName,
  });

  if (result.Items && result.Items.length > 0) {
    for (const item of result.Items) {
      const key: Record<string, any> = { [keyName]: (item as any)[keyName] };
      if (sortKeyName) {
        key[sortKeyName] = (item as any)[sortKeyName];
      }
      await dynamoDb.delete({
        TableName: tableName,
        Key: key,
      });
    }
  }

  return result.Items?.length || 0;
};

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const deletedCounts: Record<string, number> = {};

    // Delete all players
    deletedCounts.players = await deleteAllFromTable(TableNames.PLAYERS, 'playerId');

    // Delete all matches
    deletedCounts.matches = await deleteAllFromTable(TableNames.MATCHES, 'matchId', 'date');

    // Delete all championships
    deletedCounts.championships = await deleteAllFromTable(TableNames.CHAMPIONSHIPS, 'championshipId');

    // Delete all championship history
    deletedCounts.championshipHistory = await deleteAllFromTable(
      TableNames.CHAMPIONSHIP_HISTORY,
      'championshipId',
      'wonDate'
    );

    // Delete all tournaments
    deletedCounts.tournaments = await deleteAllFromTable(TableNames.TOURNAMENTS, 'tournamentId');

    // Delete all seasons
    deletedCounts.seasons = await deleteAllFromTable(TableNames.SEASONS, 'seasonId');

    // Delete all season standings
    deletedCounts.seasonStandings = await deleteAllFromTable(
      TableNames.SEASON_STANDINGS,
      'seasonId',
      'playerId'
    );

    // Delete all divisions
    deletedCounts.divisions = await deleteAllFromTable(TableNames.DIVISIONS, 'divisionId');

    return success({
      message: 'All data cleared successfully',
      deletedCounts,
    });
  } catch (err) {
    console.error('Error clearing all data:', err);
    return serverError('Failed to clear all data');
  }
};
