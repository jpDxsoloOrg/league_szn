import { DynamoDBClient, CreateTableCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:8000',
  credentials: {
    accessKeyId: 'dummy',
    secretAccessKey: 'dummy',
  },
});

const tables = [
  {
    TableName: 'wwe-2k-league-api-players-dev',
    KeySchema: [{ AttributeName: 'playerId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'playerId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'wwe-2k-league-api-matches-dev',
    KeySchema: [
      { AttributeName: 'matchId', KeyType: 'HASH' },
      { AttributeName: 'date', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'matchId', AttributeType: 'S' },
      { AttributeName: 'date', AttributeType: 'S' },
      { AttributeName: 'tournamentId', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    GlobalSecondaryIndexes: [
      {
        IndexName: 'TournamentIndex',
        KeySchema: [
          { AttributeName: 'tournamentId', KeyType: 'HASH' },
          { AttributeName: 'matchId', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },
  {
    TableName: 'wwe-2k-league-api-championships-dev',
    KeySchema: [{ AttributeName: 'championshipId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'championshipId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'wwe-2k-league-api-championship-history-dev',
    KeySchema: [
      { AttributeName: 'championshipId', KeyType: 'HASH' },
      { AttributeName: 'wonDate', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'championshipId', AttributeType: 'S' },
      { AttributeName: 'wonDate', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'wwe-2k-league-api-tournaments-dev',
    KeySchema: [{ AttributeName: 'tournamentId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'tournamentId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'wwe-2k-league-api-seasons-dev',
    KeySchema: [{ AttributeName: 'seasonId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'seasonId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'wwe-2k-league-api-season-standings-dev',
    KeySchema: [
      { AttributeName: 'seasonId', KeyType: 'HASH' },
      { AttributeName: 'playerId', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'seasonId', AttributeType: 'S' },
      { AttributeName: 'playerId', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    GlobalSecondaryIndexes: [
      {
        IndexName: 'PlayerIndex',
        KeySchema: [
          { AttributeName: 'playerId', KeyType: 'HASH' },
          { AttributeName: 'seasonId', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },
];

async function createTables() {
  console.log('Checking existing tables...');

  const existingTables = await client.send(new ListTablesCommand({}));
  const existingTableNames = existingTables.TableNames || [];

  console.log('Existing tables:', existingTableNames);

  for (const table of tables) {
    if (existingTableNames.includes(table.TableName)) {
      console.log(`Table ${table.TableName} already exists, skipping...`);
      continue;
    }

    try {
      await client.send(new CreateTableCommand(table as any));
      console.log(`Created table: ${table.TableName}`);
    } catch (error: any) {
      if (error.name === 'ResourceInUseException') {
        console.log(`Table ${table.TableName} already exists`);
      } else {
        throw error;
      }
    }
  }

  console.log('\nAll tables ready!');
}

createTables()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error creating tables:', error);
    process.exit(1);
  });
