/**
 * Backfills BLD-16: guesses a sim category for every stipulation and match
 * type that has none, from its name. Rows that already have a category are
 * never touched, and names that match nothing are left alone (they read as
 * `standard`). `updatedAt` is not changed.
 *
 * Name rules (first match wins, case and punctuation ignored):
 *   highRisk  - ladder, TLC, scaffold
 *   cage      - cage, Hell in a Cell, elimination chamber
 *   endurance - iron man, last man standing
 *   technical - submission, I Quit, 2 out of 3 falls
 *   hardcore  - street fight, extreme, tables, hardcore, falls count anywhere,
 *               no DQ, no holds barred
 *
 * Dry run (prints the plan, changes nothing):
 *   AWS_PROFILE=league-szn npm run backfill-sim-categories -- --stage devtest
 *
 * Write:
 *   AWS_PROFILE=league-szn npm run backfill-sim-categories -- --stage devtest --apply
 *
 * Stage `dev` is production and `devtest` is the dev site. Stage `offline` uses
 * DynamoDB Local (DYNAMODB_ENDPOINT, default http://localhost:8000).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { isSimCategory, type SimCategory } from '../lib/policies/buildRules';

const SERVICE = 'wwe-2k-league-api';
const OFFLINE_STAGE = 'offline';
const STAGE_PATTERN = /^[a-zA-Z0-9-]+$/;

export interface ScriptOptions {
  stage: string;
  apply: boolean;
}

/** The two tables that carry a sim category. */
export type SimCategoryTableKind = 'stipulations' | 'matchTypes';

interface TableSpec {
  kind: SimCategoryTableKind;
  tableSuffix: string;
  idField: 'stipulationId' | 'matchTypeId';
}

const TABLES: readonly TableSpec[] = [
  { kind: 'stipulations', tableSuffix: 'stipulations', idField: 'stipulationId' },
  { kind: 'matchTypes', tableSuffix: 'match-types', idField: 'matchTypeId' },
];

/** A stipulation or match type row as far as this script cares. */
export interface CategoryRow {
  id: string;
  name: string;
  simCategory?: unknown;
}

export interface CategoryWrite {
  id: string;
  name: string;
  simCategory: SimCategory;
}

export interface TablePlan {
  rows: number;
  /** Rows that already have a valid category. */
  alreadySet: number;
  /** Rows whose name matches no rule; left as `standard`. */
  unmatched: string[];
  writes: CategoryWrite[];
}

export interface RunResult {
  stipulations: TablePlan;
  matchTypes: TablePlan;
  written: number;
}

type ScriptClient = Pick<DynamoDBDocumentClient, 'send'>;

/** Keyword rules, checked in order. Keywords are matched against the normalized name. */
const NAME_RULES: ReadonlyArray<{ category: SimCategory; keywords: readonly string[] }> = [
  { category: 'highRisk', keywords: ['ladder', 'tlc', 'scaffold'] },
  { category: 'cage', keywords: ['cage', 'hell in a cell', 'elimination chamber'] },
  { category: 'endurance', keywords: ['iron man', 'ironman', 'last man standing'] },
  {
    category: 'technical',
    keywords: ['submission', 'i quit', '2 out of 3', 'two out of three', 'best of three'],
  },
  {
    category: 'hardcore',
    keywords: [
      'street fight',
      'extreme',
      'tables',
      'table match',
      'hardcore',
      'falls count anywhere',
      'no dq',
      'no disqualification',
      'no holds barred',
    ],
  },
];

function normalizeName(name: string): string {
  return ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

/** Guesses a category from a stipulation / match type name, or null when no rule matches. */
export function guessSimCategory(name: string): SimCategory | null {
  const normalized = normalizeName(name);
  for (const rule of NAME_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(` ${keyword}`))) return rule.category;
  }
  return null;
}

/** Works out every write for one table. Pure: no I/O. */
export function planTable(rows: readonly CategoryRow[]): TablePlan {
  const plan: TablePlan = { rows: rows.length, alreadySet: 0, unmatched: [], writes: [] };
  for (const row of rows) {
    if (isSimCategory(row.simCategory)) {
      plan.alreadySet++;
      continue;
    }
    const guess = guessSimCategory(row.name);
    if (guess) {
      plan.writes.push({ id: row.id, name: row.name, simCategory: guess });
    } else {
      plan.unmatched.push(row.name);
    }
  }
  return plan;
}

export function parseArgs(args: string[]): ScriptOptions {
  let stage: string | undefined;
  let apply = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--apply') {
      apply = true;
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
  return { stage, apply };
}

export function tableNameForStage(kind: SimCategoryTableKind, stage: string): string {
  const spec = TABLES.find((table) => table.kind === kind);
  if (!spec) throw new Error(`Unknown table: ${kind}`);
  return `${SERVICE}-${spec.tableSuffix}-${stage}`;
}

async function scanAll(client: ScriptClient, tableName: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const page = await client.send(new ScanCommand({
      TableName: tableName,
      ConsistentRead: true,
      ExclusiveStartKey: lastKey,
    }));
    rows.push(...((page.Items ?? []) as Record<string, unknown>[]));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return rows;
}

function toCategoryRow(item: Record<string, unknown>, idField: TableSpec['idField']): CategoryRow {
  return {
    id: String(item[idField] ?? ''),
    name: typeof item.name === 'string' ? item.name : '',
    simCategory: item.simCategory,
  };
}

function isConditionFailure(err: unknown): boolean {
  return err instanceof Error && err.name === 'ConditionalCheckFailedException';
}

function printPlan(label: string, plan: TablePlan): void {
  console.log(`${label}: ${plan.rows}`);
  console.log(`  already have a category: ${plan.alreadySet}`);
  console.log(`  no rule matched (stay standard): ${plan.unmatched.length}`);
  for (const name of plan.unmatched) console.log(`    - ${name}`);
  console.log(`  to set: ${plan.writes.length}`);
  for (const write of plan.writes) console.log(`    - ${write.name} -> ${write.simCategory}`);
}

export async function run(client: ScriptClient, options: ScriptOptions): Promise<RunResult> {
  console.log(`Stage: ${options.stage}`);
  const plans: Record<SimCategoryTableKind, TablePlan> = {
    stipulations: { rows: 0, alreadySet: 0, unmatched: [], writes: [] },
    matchTypes: { rows: 0, alreadySet: 0, unmatched: [], writes: [] },
  };

  for (const spec of TABLES) {
    const items = await scanAll(client, tableNameForStage(spec.kind, options.stage));
    plans[spec.kind] = planTable(items.map((item) => toCategoryRow(item, spec.idField)));
    printPlan(spec.kind === 'stipulations' ? 'Stipulations' : 'Match types', plans[spec.kind]);
  }

  if (!options.apply) {
    console.log('Dry run: nothing written. Add --apply to write these categories.');
    return { ...plans, written: 0 };
  }

  let written = 0;
  for (const spec of TABLES) {
    const tableName = tableNameForStage(spec.kind, options.stage);
    for (const write of plans[spec.kind].writes) {
      try {
        await client.send(new UpdateCommand({
          TableName: tableName,
          Key: { [spec.idField]: write.id },
          UpdateExpression: 'SET simCategory = :category',
          ConditionExpression: `attribute_exists(${spec.idField}) AND attribute_not_exists(simCategory)`,
          ExpressionAttributeValues: { ':category': write.simCategory },
        }));
        written++;
      } catch (err) {
        if (!isConditionFailure(err)) throw err;
        console.log(`  skipped ${write.name}: changed since the scan`);
      }
    }
  }

  const total = plans.stipulations.writes.length + plans.matchTypes.writes.length;
  console.log(`Wrote ${written} of ${total} categories.`);
  return { ...plans, written };
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
