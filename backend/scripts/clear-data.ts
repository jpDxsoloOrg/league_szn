import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

// Configure DynamoDB client for local use
const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:8000',
  credentials: {
    accessKeyId: 'dummy',
    secretAccessKey: 'dummy',
  },
});

const docClient = DynamoDBDocumentClient.from(client);

const TABLES = {
  PLAYERS: 'wwe-2k-league-api-players-dev',
  MATCHES: 'wwe-2k-league-api-matches-dev',
  CHAMPIONSHIPS: 'wwe-2k-league-api-championships-dev',
  CHAMPIONSHIP_HISTORY: 'wwe-2k-league-api-championship-history-dev',
  TOURNAMENTS: 'wwe-2k-league-api-tournaments-dev',
};

async function clearTable(tableName: string, keyNames: string[]) {
  console.log(`Clearing ${tableName}...`);

  const scanResult = await docClient.send(new ScanCommand({
    TableName: tableName,
  }));

  if (!scanResult.Items || scanResult.Items.length === 0) {
    console.log(`  No items to delete in ${tableName}`);
    return;
  }

  for (const item of scanResult.Items) {
    const key: Record<string, any> = {};
    for (const keyName of keyNames) {
      key[keyName] = item[keyName];
    }

    await docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: key,
    }));
  }

  console.log(`  ✓ Deleted ${scanResult.Items.length} items from ${tableName}`);
}

async function clearAllData() {
  console.log('Starting to clear all data from local DynamoDB...\n');

  try {
    await clearTable(TABLES.PLAYERS, ['playerId']);
    await clearTable(TABLES.MATCHES, ['matchId', 'date']);
    await clearTable(TABLES.CHAMPIONSHIPS, ['championshipId']);
    await clearTable(TABLES.CHAMPIONSHIP_HISTORY, ['championshipId', 'wonDate']);
    await clearTable(TABLES.TOURNAMENTS, ['tournamentId']);

    console.log('\n✅ All data cleared successfully!');
  } catch (error) {
    console.error('Error clearing data:', error);
    throw error;
  }
}

clearAllData()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to clear data:', error);
    process.exit(1);
  });
