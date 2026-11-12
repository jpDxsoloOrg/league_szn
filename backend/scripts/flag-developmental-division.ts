/**
 * One-off (CUP-10): flags the existing "Young Boys" division as developmental
 * and as the default division for new wrestlers, so signup placement no
 * longer depends on the division's name. Any other division that already
 * carries isDefaultForNewWrestlers has the flag cleared in the same
 * transaction. Touches only the divisions table.
 *
 * Dry run (prints the plan, changes nothing):
 *   AWS_PROFILE=league-szn npm run flag-developmental-division -- --stage devtest
 *
 * Write:
 *   AWS_PROFILE=league-szn npm run flag-developmental-division -- --stage devtest --apply
 *
 * Use --name "<division name>" to flag a different division (case-insensitive).
 *
 * Stage `dev` is production and `devtest` is the dev site. Stage `offline` uses
 * DynamoDB Local (DYNAMODB_ENDPOINT, default http://localhost:8000).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';

const SERVICE = 'wwe-2k-league-api';
const OFFLINE_STAGE = 'offline';
const STAGE_PATTERN = /^[a-zA-Z0-9-]+$/;
export const DEFAULT_DIVISION_NAME = 'Young Boys';

export interface ScriptOptions {
  stage: string;
  apply: boolean;
  name: string;
}

export interface DivisionRow {
  divisionId: string;
  name?: string;
  isDevelopmental?: boolean;
  isDefaultForNewWrestlers?: boolean;
}

export interface FlagPlan {
  target: DivisionRow | undefined;
  /** True when the target already has both flags. */
  targetAlreadyFlagged: boolean;
  /** Other divisions that currently hold isDefaultForNewWrestlers. */
  clearDefaultOn: DivisionRow[];
}

export interface RunResult {
  tableName: string;
  plan: FlagPlan;
  applied: boolean;
}

type ScriptClient = Pick<DynamoDBDocumentClient, 'send'>;

export function parseArgs(args: string[]): ScriptOptions {
  let stage: string | undefined;
  let apply = false;
  let name = DEFAULT_DIVISION_NAME;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--apply') {
      apply = true;
    } else if (arg === '--stage') {
      index++;
      stage = args[index];
    } else if (arg.startsWith('--stage=')) {
      stage = arg.slice('--stage='.length);
    } else if (arg === '--name') {
      index++;
      name = args[index] ?? '';
    } else if (arg.startsWith('--name=')) {
      name = arg.slice('--name='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!stage || !STAGE_PATTERN.test(stage)) {
    throw new Error('--stage <stage> is required (dev is production, devtest is the dev site)');
  }
  if (name.trim().length === 0) {
    throw new Error('--name must not be empty');
  }
  return { stage, apply, name: name.trim() };
}

export function tableNameForStage(stage: string): string {
  return `${SERVICE}-divisions-${stage}`;
}

export function planFlags(rows: DivisionRow[], name: string): FlagPlan {
  const wanted = name.trim().toLowerCase();
  const matches = rows.filter((row) => (row.name ?? '').trim().toLowerCase() === wanted);
  if (matches.length > 1) {
    throw new Error(
      `${matches.length} divisions are named "${name}" (${matches.map((m) => m.divisionId).join(', ')}); ` +
        'rename one first so the target is unambiguous',
    );
  }
  const target = matches[0];
  const clearDefaultOn = rows.filter(
    (row) => row.isDefaultForNewWrestlers === true && row.divisionId !== target?.divisionId,
  );
  return {
    target,
    targetAlreadyFlagged:
      target?.isDevelopmental === true && target?.isDefaultForNewWrestlers === true,
    clearDefaultOn,
  };
}

export function buildTransaction(tableName: string, plan: FlagPlan, now: string): TransactWriteCommandInput {
  if (!plan.target) throw new Error('No target division to flag');
  const items: NonNullable<TransactWriteCommandInput['TransactItems']> = plan.clearDefaultOn.map((row) => ({
    Update: {
      TableName: tableName,
      Key: { divisionId: row.divisionId },
      UpdateExpression: 'SET #isDefault = :false, #updatedAt = :now',
      // Only clear a row that is still the default when the write lands.
      ConditionExpression: 'attribute_exists(divisionId) AND #isDefault = :true',
      ExpressionAttributeNames: { '#isDefault': 'isDefaultForNewWrestlers', '#updatedAt': 'updatedAt' },
      ExpressionAttributeValues: { ':false': false, ':true': true, ':now': now },
    },
  }));
  items.push({
    Update: {
      TableName: tableName,
      Key: { divisionId: plan.target.divisionId },
      UpdateExpression: 'SET #isDev = :true, #isDefault = :true, #updatedAt = :now',
      ConditionExpression: 'attribute_exists(divisionId)',
      ExpressionAttributeNames: {
        '#isDev': 'isDevelopmental',
        '#isDefault': 'isDefaultForNewWrestlers',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: { ':true': true, ':now': now },
    },
  });
  return { TransactItems: items };
}

async function scanRows(client: ScriptClient, tableName: string): Promise<DivisionRow[]> {
  const rows: DivisionRow[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const page = await client.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'divisionId, #name, isDevelopmental, isDefaultForNewWrestlers',
      ExpressionAttributeNames: { '#name': 'name' },
      ConsistentRead: true,
      ExclusiveStartKey: lastKey,
    }));
    rows.push(...((page.Items ?? []) as DivisionRow[]));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  return rows;
}

function describeRow(row: DivisionRow): string {
  const flags = [
    row.isDevelopmental === true ? 'developmental' : null,
    row.isDefaultForNewWrestlers === true ? 'default' : null,
  ].filter(Boolean);
  return `"${row.name ?? '(no name)'}" (${row.divisionId})${flags.length ? ` [${flags.join(', ')}]` : ''}`;
}

export async function run(client: ScriptClient, options: ScriptOptions): Promise<RunResult> {
  const tableName = tableNameForStage(options.stage);
  const rows = await scanRows(client, tableName);
  const plan = planFlags(rows, options.name);

  console.log(`Table: ${tableName}`);
  console.log(`Divisions: ${rows.length}`);
  for (const row of rows) console.log(`  ${describeRow(row)}`);

  if (!plan.target) {
    console.log(`No division named "${options.name}" found. Nothing to do.`);
    return { tableName, plan, applied: false };
  }
  if (plan.targetAlreadyFlagged && plan.clearDefaultOn.length === 0) {
    console.log(`${describeRow(plan.target)} is already flagged. Nothing to do.`);
    return { tableName, plan, applied: false };
  }

  console.log(`Would set isDevelopmental=true, isDefaultForNewWrestlers=true on ${describeRow(plan.target)}`);
  for (const row of plan.clearDefaultOn) {
    console.log(`Would clear isDefaultForNewWrestlers on ${describeRow(row)}`);
  }

  if (!options.apply) {
    console.log('Dry run: nothing written. Add --apply to write these changes.');
    return { tableName, plan, applied: false };
  }

  await client.send(new TransactWriteCommand(buildTransaction(tableName, plan, new Date().toISOString())));
  console.log('Applied.');
  return { tableName, plan, applied: true };
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
