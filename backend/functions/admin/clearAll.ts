import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';
import { requireSuperAdmin } from '../../lib/auth';

const deleteAllFromTable = async (
  tableName: string,
  keyName: string,
  sortKeyName?: string
): Promise<{ deleted: number; errors: number }> => {
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
    return { deleted: 0, errors: 0 };
  }

  // Delete items sequentially to avoid throttling
  // Wrap each delete in try-catch to collect errors rather than failing entirely
  let deleted = 0;
  const failedKeys: Record<string, unknown>[] = [];

  for (const item of items) {
    const key: Record<string, unknown> = { [keyName]: item[keyName] };
    if (sortKeyName) {
      key[sortKeyName] = item[sortKeyName];
    }
    try {
      await dynamoDb.delete({
        TableName: tableName,
        Key: key,
      });
      deleted++;
    } catch (err) {
      failedKeys.push(key);
      console.error(`Failed to delete item from ${tableName}:`, key, err);
    }
  }

  if (failedKeys.length > 0) {
    console.error(
      `${failedKeys.length} of ${items.length} deletes failed for table ${tableName}`
    );
  }

  return { deleted, errors: failedKeys.length };
};

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireSuperAdmin(event);
  if (denied) return denied;

  try {
    const deletedCounts: Record<string, number> = {};
    const errorCounts: Record<string, number> = {};
    let totalErrors = 0;

    // Helper to run deleteAllFromTable and record results
    const clearTable = async (label: string, tableName: string, keyName: string, sortKeyName?: string) => {
      const result = await deleteAllFromTable(tableName, keyName, sortKeyName);
      deletedCounts[label] = result.deleted;
      if (result.errors > 0) {
        errorCounts[label] = result.errors;
        totalErrors += result.errors;
      }
    };

    // Delete all players
    await clearTable('players', TableNames.PLAYERS, 'playerId');

    // Delete all matches
    await clearTable('matches', TableNames.MATCHES, 'matchId', 'date');

    // Delete all championships
    await clearTable('championships', TableNames.CHAMPIONSHIPS, 'championshipId');

    // Delete all championship history
    await clearTable('championshipHistory', TableNames.CHAMPIONSHIP_HISTORY, 'championshipId', 'wonDate');

    // Delete all tournaments
    await clearTable('tournaments', TableNames.TOURNAMENTS, 'tournamentId');

    // Delete all seasons
    await clearTable('seasons', TableNames.SEASONS, 'seasonId');

    // Delete all season standings
    await clearTable('seasonStandings', TableNames.SEASON_STANDINGS, 'seasonId', 'playerId');

    // Delete all divisions
    await clearTable('divisions', TableNames.DIVISIONS, 'divisionId');

    // Delete all events
    await clearTable('events', TableNames.EVENTS, 'eventId');

    // Delete all contender rankings
    await clearTable('contenderRankings', TableNames.CONTENDER_RANKINGS, 'championshipId', 'playerId');

    // Delete all ranking history
    await clearTable('rankingHistory', TableNames.RANKING_HISTORY, 'playerId', 'weekKey');

    // Delete all challenges
    await clearTable('challenges', TableNames.CHALLENGES, 'challengeId');

    // Delete all promos
    await clearTable('promos', TableNames.PROMOS, 'promoId');

    const response: Record<string, unknown> = {
      message: totalErrors > 0
        ? `Data cleared with ${totalErrors} individual delete error(s)`
        : 'All data cleared successfully',
      deletedCounts,
    };

    if (totalErrors > 0) {
      response.errorCounts = errorCounts;
    }

    return success(response);
  } catch (err) {
    console.error('Error clearing all data:', err);
    return serverError('Failed to clear all data');
  }
};
