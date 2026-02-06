import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

const deleteAllFromTable = async (
  tableName: string,
  keyName: string,
  sortKeyName?: string
): Promise<number> => {
  // Use ExpressionAttributeNames to handle reserved words like 'date', 'name', etc.
  const expressionAttributeNames: Record<string, string> = {
    '#pk': keyName,
  };
  let projectionExpression = '#pk';

  if (sortKeyName) {
    expressionAttributeNames['#sk'] = sortKeyName;
    projectionExpression += ', #sk';
  }

  // Use scanAll to handle pagination for tables with >1MB of data
  const items = await dynamoDb.scanAll({
    TableName: tableName,
    ProjectionExpression: projectionExpression,
    ExpressionAttributeNames: expressionAttributeNames,
  });

  if (items.length === 0) {
    return 0;
  }

  // Delete items sequentially to avoid throttling
  // For very large datasets, consider using BatchWriteItem for better performance
  for (const item of items) {
    const key: Record<string, unknown> = { [keyName]: item[keyName] };
    if (sortKeyName) {
      key[sortKeyName] = item[sortKeyName];
    }
    await dynamoDb.delete({
      TableName: tableName,
      Key: key,
    });
  }

  return items.length;
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

    // Delete all events
    deletedCounts.events = await deleteAllFromTable(TableNames.EVENTS, 'eventId');

    // Delete all contender rankings
    deletedCounts.contenderRankings = await deleteAllFromTable(
      TableNames.CONTENDER_RANKINGS,
      'championshipId',
      'playerId'
    );

    // Delete all ranking history
    deletedCounts.rankingHistory = await deleteAllFromTable(
      TableNames.RANKING_HISTORY,
      'playerId',
      'weekKey'
    );

    return success({
      message: 'All data cleared successfully',
      deletedCounts,
    });
  } catch (err) {
    console.error('Error clearing all data:', err);
    return serverError('Failed to clear all data');
  }
};
