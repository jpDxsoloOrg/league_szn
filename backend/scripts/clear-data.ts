import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

const STAGE = process.env.STAGE || 'offline';
const isLocal = process.env.IS_OFFLINE === 'true' || STAGE === 'offline';

const client = new DynamoDBClient(
  isLocal
    ? {
        region: 'us-east-1',
        endpoint: 'http://localhost:8000',
        credentials: {
          accessKeyId: 'dummy',
          secretAccessKey: 'dummy',
        },
      }
    : { region: 'us-east-1' }
);

const docClient = DynamoDBDocumentClient.from(client);

// All 16 tables (matches the seed scripts)
const TABLES = {
  PLAYERS: `wwe-2k-league-api-players-${STAGE}`,
  MATCHES: `wwe-2k-league-api-matches-${STAGE}`,
  CHAMPIONSHIPS: `wwe-2k-league-api-championships-${STAGE}`,
  CHAMPIONSHIP_HISTORY: `wwe-2k-league-api-championship-history-${STAGE}`,
  TOURNAMENTS: `wwe-2k-league-api-tournaments-${STAGE}`,
  SEASONS: `wwe-2k-league-api-seasons-${STAGE}`,
  SEASON_STANDINGS: `wwe-2k-league-api-season-standings-${STAGE}`,
  DIVISIONS: `wwe-2k-league-api-divisions-${STAGE}`,
  EVENTS: `wwe-2k-league-api-events-${STAGE}`,
  CONTENDER_RANKINGS: `wwe-2k-league-api-contender-rankings-${STAGE}`,
  RANKING_HISTORY: `wwe-2k-league-api-ranking-history-${STAGE}`,
  FANTASY_CONFIG: `wwe-2k-league-api-fantasy-config-${STAGE}`,
  WRESTLER_COSTS: `wwe-2k-league-api-wrestler-costs-${STAGE}`,
  FANTASY_PICKS: `wwe-2k-league-api-fantasy-picks-${STAGE}`,
  SITE_CONFIG: `wwe-2k-league-api-site-config-${STAGE}`,
};

async function clearTable(tableName: string, keyNames: string[]): Promise<void> {
  console.log(`Clearing ${tableName}...`);

  try {
    const scanResult = await docClient.send(new ScanCommand({ TableName: tableName }));

    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.log(`  No items to delete in ${tableName}`);
      return;
    }

    for (const item of scanResult.Items) {
      const key: Record<string, unknown> = {};
      for (const keyName of keyNames) {
        key[keyName] = item[keyName];
      }

      await docClient.send(new DeleteCommand({ TableName: tableName, Key: key }));
    }

    console.log(`  ✓ Deleted ${scanResult.Items.length} items from ${tableName}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Table may not exist (e.g., running locally without create-tables)
    if (message.includes('Cannot do operations on a non-existent table')) {
      console.log(`  ⚠ Table ${tableName} does not exist, skipping`);
    } else {
      throw err;
    }
  }
}

async function clearAllData(): Promise<void> {
  console.log('Starting to clear all data...\n');

  // Core tables
  await clearTable(TABLES.PLAYERS, ['playerId']);
  await clearTable(TABLES.MATCHES, ['matchId', 'date']);
  await clearTable(TABLES.CHAMPIONSHIPS, ['championshipId']);
  await clearTable(TABLES.CHAMPIONSHIP_HISTORY, ['championshipId', 'wonDate']);
  await clearTable(TABLES.TOURNAMENTS, ['tournamentId']);

  // Season tables
  await clearTable(TABLES.SEASONS, ['seasonId']);
  await clearTable(TABLES.SEASON_STANDINGS, ['seasonId', 'playerId']);

  // Division table
  await clearTable(TABLES.DIVISIONS, ['divisionId']);

  // Event table
  await clearTable(TABLES.EVENTS, ['eventId']);

  // Contender tables
  await clearTable(TABLES.CONTENDER_RANKINGS, ['championshipId', 'playerId']);
  await clearTable(TABLES.RANKING_HISTORY, ['playerId', 'weekKey']);

  // Fantasy tables
  await clearTable(TABLES.FANTASY_CONFIG, ['configKey']);
  await clearTable(TABLES.WRESTLER_COSTS, ['playerId']);
  await clearTable(TABLES.FANTASY_PICKS, ['eventId', 'playerId']);

  // Config table
  await clearTable(TABLES.SITE_CONFIG, ['configKey']);

  console.log('\n✅ All data cleared successfully!');
}

clearAllData()
  .then(() => { console.log('\nDone!'); process.exit(0); })
  .catch((error) => { console.error('Failed to clear data:', error); process.exit(1); });
