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
  // Rivalries (RIV-01): META + PARTICIPANT rows sharing the same partition key.
  { key: 'rivalries', tableName: TableNames.RIVALRIES, partitionKey: 'rivalryId', sortKey: 'recordType' },
  { key: 'rivalryMessages', tableName: TableNames.RIVALRY_MESSAGES, partitionKey: 'rivalryId', sortKey: 'messageId' },
  { key: 'rivalryNotes', tableName: TableNames.RIVALRY_NOTES, partitionKey: 'rivalryId', sortKey: 'noteId' },
  // MatchRatings (RIV-20): one row per (matchId, userId) — included here so
  // re-seeds clear stale ratings and the seed handler can ferry rows in via
  // importAllData. Aggregates live on the matches table (RIV-22).
  { key: 'matchRatings', tableName: TableNames.MATCH_RATINGS, partitionKey: 'matchId', sortKey: 'userId' },
];

async function deleteAllItemsFromTable(
  table: TableConfig,
): Promise<{ deleted: number; errors: number }> {
  const projectionParts = [table.partitionKey];
  if (table.sortKey) {
    projectionParts.push(table.sortKey);
  }

  let items: Record<string, unknown>[] = [];
  try {
    items = await dynamoDb.scanAll({
      TableName: table.tableName,
      ProjectionExpression: projectionParts.join(', '),
    });
  } catch (err) {
    // A missing / undeployed table or an IAM-deny here would otherwise
    // crash the entire clear loop and leave every later table untouched.
    // Surface as a per-table error count instead so the rest of the
    // operation finishes; the handler logs the underlying cause.
    console.error(`scanAll failed for ${table.tableName}:`, err);
    return { deleted: 0, errors: 1 };
  }

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
    } catch (err) {
      console.error(`delete failed on ${table.tableName} key`, key, err);
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
    // Defensive: a table-level failure (table missing entirely, network
    // blip) must not stop the rest of the loop. Each table reports its
    // own deleted + errors counts independently.
    try {
      results[table.key] = await deleteAllItemsFromTable(table);
    } catch (err) {
      console.error(`Unexpected failure clearing ${table.tableName}:`, err);
      results[table.key] = { deleted: 0, errors: 1 };
    }
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
    // Clear existing data first; per-table catch so a missing table
    // doesn't poison the rest of the import.
    try {
      await deleteAllItemsFromTable(table);
    } catch (err) {
      console.error(`Pre-import clear failed for ${table.tableName}:`, err);
    }

    const records = data[table.key];
    if (!records || records.length === 0) {
      counts[table.key] = 0;
      continue;
    }

    let imported = 0;
    for (const record of records) {
      try {
        await dynamoDb.put({
          TableName: table.tableName,
          Item: record,
        });
        imported++;
      } catch (err) {
        // Single-record failures (bad shape, conditional-check fail,
        // schema mismatch) must not abort the rest of the import. Log
        // and continue so the next table still gets seeded.
        console.error(`put failed on ${table.tableName}:`, err, 'record keys:', Object.keys(record));
      }
    }

    counts[table.key] = imported;
  }

  return counts;
}
