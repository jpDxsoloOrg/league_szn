import { DynamoDBClient, CreateTableCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb';

const STAGE = process.env.STAGE || 'offline';
const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';

const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: DYNAMODB_ENDPOINT,
  credentials: {
    accessKeyId: 'dummy',
    secretAccessKey: 'dummy',
  },
});

const tables = [
  {
    TableName: `wwe-2k-league-api-players-${STAGE}`,
    KeySchema: [{ AttributeName: 'playerId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'playerId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: `wwe-2k-league-api-matches-${STAGE}`,
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
    TableName: `wwe-2k-league-api-championships-${STAGE}`,
    KeySchema: [{ AttributeName: 'championshipId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'championshipId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: `wwe-2k-league-api-championship-history-${STAGE}`,
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
    TableName: `wwe-2k-league-api-tournaments-${STAGE}`,
    KeySchema: [{ AttributeName: 'tournamentId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'tournamentId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: `wwe-2k-league-api-seasons-${STAGE}`,
    KeySchema: [{ AttributeName: 'seasonId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'seasonId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: `wwe-2k-league-api-season-standings-${STAGE}`,
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
  {
    TableName: `wwe-2k-league-api-divisions-${STAGE}`,
    KeySchema: [{ AttributeName: 'divisionId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'divisionId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: `wwe-2k-league-api-events-${STAGE}`,
    KeySchema: [{ AttributeName: 'eventId', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'eventId', AttributeType: 'S' },
      { AttributeName: 'eventType', AttributeType: 'S' },
      { AttributeName: 'date', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' },
      { AttributeName: 'seasonId', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    GlobalSecondaryIndexes: [
      {
        IndexName: 'DateIndex',
        KeySchema: [
          { AttributeName: 'eventType', KeyType: 'HASH' },
          { AttributeName: 'date', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'StatusIndex',
        KeySchema: [
          { AttributeName: 'status', KeyType: 'HASH' },
          { AttributeName: 'date', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'SeasonIndex',
        KeySchema: [
          { AttributeName: 'seasonId', KeyType: 'HASH' },
          { AttributeName: 'date', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },
  {
    TableName: `wwe-2k-league-api-contender-rankings-${STAGE}`,
    KeySchema: [
      { AttributeName: 'championshipId', KeyType: 'HASH' },
      { AttributeName: 'playerId', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'championshipId', AttributeType: 'S' },
      { AttributeName: 'playerId', AttributeType: 'S' },
      { AttributeName: 'rank', AttributeType: 'N' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    GlobalSecondaryIndexes: [
      {
        IndexName: 'RankIndex',
        KeySchema: [
          { AttributeName: 'championshipId', KeyType: 'HASH' },
          { AttributeName: 'rank', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },
  {
    TableName: `wwe-2k-league-api-ranking-history-${STAGE}`,
    KeySchema: [
      { AttributeName: 'playerId', KeyType: 'HASH' },
      { AttributeName: 'weekKey', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'playerId', AttributeType: 'S' },
      { AttributeName: 'weekKey', AttributeType: 'S' },
      { AttributeName: 'championshipId', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    GlobalSecondaryIndexes: [
      {
        IndexName: 'ChampionshipWeekIndex',
        KeySchema: [
          { AttributeName: 'championshipId', KeyType: 'HASH' },
          { AttributeName: 'weekKey', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },
  {
    TableName: `wwe-2k-league-api-fantasy-config-${STAGE}`,
    KeySchema: [{ AttributeName: 'configKey', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'configKey', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: `wwe-2k-league-api-wrestler-costs-${STAGE}`,
    KeySchema: [{ AttributeName: 'playerId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'playerId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: `wwe-2k-league-api-fantasy-picks-${STAGE}`,
    KeySchema: [
      { AttributeName: 'eventId', KeyType: 'HASH' },
      { AttributeName: 'fantasyUserId', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'eventId', AttributeType: 'S' },
      { AttributeName: 'fantasyUserId', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    GlobalSecondaryIndexes: [
      {
        IndexName: 'FantasyUserIndex',
        KeySchema: [
          { AttributeName: 'fantasyUserId', KeyType: 'HASH' },
          { AttributeName: 'eventId', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },
  {
    TableName: `wwe-2k-league-api-site-config-${STAGE}`,
    KeySchema: [{ AttributeName: 'configKey', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'configKey', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: `wwe-2k-league-api-challenges-${STAGE}`,
    KeySchema: [{ AttributeName: 'challengeId', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'challengeId', AttributeType: 'S' },
      { AttributeName: 'challengerId', AttributeType: 'S' },
      { AttributeName: 'challengedId', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    GlobalSecondaryIndexes: [
      {
        IndexName: 'ChallengerIndex',
        KeySchema: [
          { AttributeName: 'challengerId', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'ChallengedIndex',
        KeySchema: [
          { AttributeName: 'challengedId', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'StatusIndex',
        KeySchema: [
          { AttributeName: 'status', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },
  {
    TableName: `wwe-2k-league-api-promos-${STAGE}`,
    KeySchema: [{ AttributeName: 'promoId', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'promoId', AttributeType: 'S' },
      { AttributeName: 'playerId', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' },
      { AttributeName: 'promoType', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    GlobalSecondaryIndexes: [
      {
        IndexName: 'PlayerIndex',
        KeySchema: [
          { AttributeName: 'playerId', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'TypeIndex',
        KeySchema: [
          { AttributeName: 'promoType', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },
  {
    TableName: `wwe-2k-league-api-stipulations-${STAGE}`,
    KeySchema: [{ AttributeName: 'stipulationId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'stipulationId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: `wwe-2k-league-api-match-types-${STAGE}`,
    KeySchema: [{ AttributeName: 'matchTypeId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'matchTypeId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
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
