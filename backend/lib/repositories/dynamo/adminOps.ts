import { dynamoDb, TableNames } from '../../dynamodb';

interface TableConfig {
  key: string;
  tableName: string;
  partitionKey: string;
  sortKey?: string;
}

const ALL_TABLES: TableConfig[] = [
  { key: 'divisions', tableName: TableNames.DIVISIONS, partitionKey: 'divisionId' },
  { key: 'players', tableName: TableNames.PLAYERS, partitionKey: 'playerId' },
  { key: 'seasons', tableName: TableNames.SEASONS, partitionKey: 'seasonId' },
  { key: 'seasonStandings', tableName: TableNames.SEASON_STANDINGS, partitionKey: 'seasonId', sortKey: 'playerId' },
  { key: 'championships', tableName: TableNames.CHAMPIONSHIPS, partitionKey: 'championshipId' },
  {
    key: 'championshipHistory',
    tableName: TableNames.CHAMPIONSHIP_HISTORY,
    partitionKey: 'championshipId',
    sortKey: 'wonDate',
  },
  { key: 'matches', tableName: TableNames.MATCHES, partitionKey: 'matchId', sortKey: 'date' },
  { key: 'tournaments', tableName: TableNames.TOURNAMENTS, partitionKey: 'tournamentId' },
  { key: 'events', tableName: TableNames.EVENTS, partitionKey: 'eventId' },
  {
    key: 'contenderRankings',
    tableName: TableNames.CONTENDER_RANKINGS,
    partitionKey: 'championshipId',
    sortKey: 'playerId',
  },
  {
    key: 'contenderOverrides',
    tableName: TableNames.CONTENDER_OVERRIDES,
    partitionKey: 'championshipId',
    sortKey: 'playerId',
  },
  { key: 'rankingHistory', tableName: TableNames.RANKING_HISTORY, partitionKey: 'playerId', sortKey: 'weekKey' },
  { key: 'fantasyConfig', tableName: TableNames.FANTASY_CONFIG, partitionKey: 'configKey' },
  { key: 'wrestlerCosts', tableName: TableNames.WRESTLER_COSTS, partitionKey: 'playerId' },
  { key: 'fantasyPicks', tableName: TableNames.FANTASY_PICKS, partitionKey: 'eventId', sortKey: 'fantasyUserId' },
  { key: 'siteConfig', tableName: TableNames.SITE_CONFIG, partitionKey: 'configKey' },
  { key: 'challenges', tableName: TableNames.CHALLENGES, partitionKey: 'challengeId' },
  { key: 'promos', tableName: TableNames.PROMOS, partitionKey: 'promoId' },
  { key: 'stipulations', tableName: TableNames.STIPULATIONS, partitionKey: 'stipulationId' },
  { key: 'matchTypes', tableName: TableNames.MATCH_TYPES, partitionKey: 'matchTypeId' },
  { key: 'seasonAwards', tableName: TableNames.SEASON_AWARDS, partitionKey: 'seasonId', sortKey: 'awardId' },
];

async function deleteAllItemsFromTable(
  table: TableConfig,
): Promise<{ deleted: number; errors: number }> {
  const projectionParts = [table.partitionKey];
  if (table.sortKey) {
    projectionParts.push(table.sortKey);
  }

  const items = await dynamoDb.scanAll({
    TableName: table.tableName,
    ProjectionExpression: projectionParts.join(', '),
  });

  let deleted = 0;
  let errors = 0;

  for (const item of items) {
    const key: Record<string, unknown> = {
      [table.partitionKey]: item[table.partitionKey],
    };
    if (table.sortKey) {
      key[table.sortKey] = item[table.sortKey];
    }

    try {
      await dynamoDb.delete({
        TableName: table.tableName,
        Key: key,
      });
      deleted++;
    } catch {
      errors++;
    }
  }

  return { deleted, errors };
}

export async function dynamoClearAllData(): Promise<
  Record<string, { deleted: number; errors: number }>
> {
  const results: Record<string, { deleted: number; errors: number }> = {};

  for (const table of ALL_TABLES) {
    results[table.key] = await deleteAllItemsFromTable(table);
  }

  return results;
}

export async function dynamoExportAllData(): Promise<
  Record<string, Record<string, unknown>[]>
> {
  const data: Record<string, Record<string, unknown>[]> = {};

  for (const table of ALL_TABLES) {
    data[table.key] = await dynamoDb.scanAll({
      TableName: table.tableName,
    });
  }

  return data;
}

export async function dynamoImportAllData(
  data: Record<string, Record<string, unknown>[]>,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  for (const table of ALL_TABLES) {
    // Clear existing data first
    await deleteAllItemsFromTable(table);

    const records = data[table.key];
    if (!records || records.length === 0) {
      counts[table.key] = 0;
      continue;
    }

    let imported = 0;
    for (const record of records) {
      await dynamoDb.put({
        TableName: table.tableName,
        Item: record,
      });
      imported++;
    }

    counts[table.key] = imported;
  }

  return counts;
}
