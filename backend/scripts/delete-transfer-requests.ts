/**
 * Deletes ALL rows from the transfer-requests table of one stage. Touches
 * nothing else: players keep their divisions and nobody is notified.
 *
 * Dry run (prints counts by status, changes nothing):
 *   AWS_PROFILE=league-szn npm run delete-transfer-requests -- --stage devtest
 *
 * Delete:
 *   AWS_PROFILE=league-szn npm run delete-transfer-requests -- --stage devtest --confirm
 *
 * Stage `dev` is production and `devtest` is the dev site. Stage `offline` uses
 * DynamoDB Local (DYNAMODB_ENDPOINT, default http://localhost:8000).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const SERVICE = 'wwe-2k-league-api';
const OFFLINE_STAGE = 'offline';
const STAGE_PATTERN = /^[a-zA-Z0-9-]+$/;

export interface ScriptOptions {
  stage: string;
  confirm: boolean;
}

export interface TransferRequestRow {
  requestId: string;
  status?: string;
}

export interface RunResult {
  tableName: string;
  found: number;
  deleted: number;
  countsByStatus: Record<string, number>;
}

type ScriptClient = Pick<DynamoDBDocumentClient, 'send'>;

export function parseArgs(args: string[]): ScriptOptions {
  let stage: string | undefined;
  let confirm = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--confirm') {
      confirm = true;
    } else if (arg === '--stage') {
      index++;
      stage = args[index];
    } else if (arg.startsWith('--stage=')) {
      stage = arg.slice('--stage='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!stage || !STAGE_PATTERN.test(stage)) {
    throw new Error('--stage <stage> is required (dev is production, devtest is the dev site)');
  }
  return { stage, confirm };
}

export function tableNameForStage(stage: string): string {
  return `${SERVICE}-transfer-requests-${stage}`;
}

export function countByStatus(rows: TransferRequestRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { status } of rows) {
    const key = status ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function scanRows(client: ScriptClient, tableName: string): Promise<TransferRequestRow[]> {
  const rows: TransferRequestRow[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const page = await client.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'requestId, #status',
      ExpressionAttributeNames: { '#status': 'status' },
      ConsistentRead: true,
      ExclusiveStartKey: lastKey,
    }));
    rows.push(...((page.Items ?? []) as TransferRequestRow[]));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  return rows;
}

export async function run(client: ScriptClient, options: ScriptOptions): Promise<RunResult> {
  const tableName = tableNameForStage(options.stage);
  const rows = await scanRows(client, tableName);
  const countsByStatus = countByStatus(rows);

  console.log(`Table: ${tableName}`);
  console.log(`Rows: ${rows.length}`);
  for (const [status, count] of Object.entries(countsByStatus)) {
    console.log(`  ${status}: ${count}`);
  }

  if (!options.confirm) {
    console.log('Dry run: nothing deleted. Add --confirm to delete these rows.');
    return { tableName, found: rows.length, deleted: 0, countsByStatus };
  }

  let deleted = 0;
  for (const { requestId } of rows) {
    await client.send(new DeleteCommand({ TableName: tableName, Key: { requestId } }));
    deleted++;
  }

  console.log(`Deleted ${deleted} of ${rows.length} rows.`);
  return { tableName, found: rows.length, deleted, countsByStatus };
}

function buildClient(stage: string): DynamoDBDocumentClient {
  const dynamoClient = new DynamoDBClient(
    stage === OFFLINE_STAGE
      ? {
          region: 'us-east-1',
          endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
          credentials: { accessKeyId: 'dummy', secretAccessKey: 'dummy' },
        }
      : { region: 'us-east-1' },
  );
  return DynamoDBDocumentClient.from(dynamoClient);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await run(buildClient(options.stage), options);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
