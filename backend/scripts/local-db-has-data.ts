import { DynamoDBClient, ListTablesCommand, ScanCommand } from '@aws-sdk/client-dynamodb';

const stage = process.env.STAGE || 'offline';
const dynamoDbEndpoint = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const prefix = 'wwe-2k-league-api-';
const suffix = `-${stage}`;

const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: dynamoDbEndpoint,
  credentials: {
    accessKeyId: 'dummy',
    secretAccessKey: 'dummy',
  },
});

async function hasAnyData(): Promise<boolean> {
  const listResult = await client.send(new ListTablesCommand({}));
  const stageTables = (listResult.TableNames || []).filter(
    (tableName) => tableName.startsWith(prefix) && tableName.endsWith(suffix)
  );

  if (stageTables.length === 0) {
    return false;
  }

  for (const tableName of stageTables) {
    const scanResult = await client.send(
      new ScanCommand({
        TableName: tableName,
        Select: 'COUNT',
        Limit: 1,
      })
    );

    if ((scanResult.Count || 0) > 0) {
      return true;
    }
  }

  return false;
}

hasAnyData()
  .then((hasData) => {
    // Keep output machine-friendly for shell scripts.
    console.log(`HAS_DATA=${hasData ? '1' : '0'}`);
  })
  .catch((error) => {
    console.error('Failed to check local DynamoDB data:', error);
    process.exit(1);
  });
