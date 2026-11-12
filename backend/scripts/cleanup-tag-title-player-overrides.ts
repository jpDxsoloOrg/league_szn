/**
 * One-off cleanup for TTC-04 (#171). Tag titles now rank tag teams, so a
 * contender override on a tag title must name a team. Overrides written before
 * that name a player: the recalculation ignores them, and setOverride no longer
 * accepts them. This lists them and, with --apply, deletes the active ones.
 *
 * Inactive player overrides on tag titles are history (removed or replaced):
 * they are counted but kept.
 *
 * Every override this would delete is printed in full first, so the output is
 * the record of what was removed.
 *
 * Dry run (lists and counts, changes nothing):
 *   AWS_PROFILE=league-szn npm run cleanup-tag-title-player-overrides -- --stage devtest
 *
 * Delete:
 *   AWS_PROFILE=league-szn npm run cleanup-tag-title-player-overrides -- --stage devtest --apply
 *
 * Stage `dev` is production and `devtest` is the dev site. Stage `offline` uses
 * DynamoDB Local (DYNAMODB_ENDPOINT, default http://localhost:8000).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const SERVICE = 'wwe-2k-league-api';
const OFFLINE_STAGE = 'offline';
const STAGE_PATTERN = /^[a-zA-Z0-9-]+$/;

export interface ScriptOptions {
  stage: string;
  apply: boolean;
}

export interface ChampionshipRow {
  championshipId: string;
  name?: string;
  type?: string;
}

export interface OverrideRow {
  championshipId: string;
  playerId: string;
  entityType?: string;
  overrideType?: string;
  active?: boolean;
  reason?: string;
  createdBy?: string;
  createdAt?: string;
  expiresAt?: string;
}

export interface RunResult {
  tagTitles: number;
  /** Player overrides on tag titles, active or not. */
  found: number;
  active: number;
  inactive: number;
  deleted: number;
}

type ScriptClient = Pick<DynamoDBDocumentClient, 'send'>;

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

export function tableNamesForStage(stage: string): { championships: string; overrides: string } {
  return {
    championships: `${SERVICE}-championships-${stage}`,
    overrides: `${SERVICE}-contender-overrides-${stage}`,
  };
}

/** True for an override that names a player: missing `entityType` means player. */
export function isPlayerOverride(override: OverrideRow): boolean {
  return (override.entityType ?? 'player') !== 'tagTeam';
}

async function listTagTitles(client: ScriptClient, tableName: string): Promise<ChampionshipRow[]> {
  const rows: ChampionshipRow[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const page = await client.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'championshipId, #name, #type',
      ExpressionAttributeNames: { '#name': 'name', '#type': 'type' },
      ExclusiveStartKey: lastKey,
    }));
    rows.push(...((page.Items ?? []) as ChampionshipRow[]));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return rows.filter((row) => row.type === 'tag');
}

async function listOverrides(client: ScriptClient, tableName: string, championshipId: string): Promise<OverrideRow[]> {
  const rows: OverrideRow[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const page = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'championshipId = :cid',
      ExpressionAttributeValues: { ':cid': championshipId },
      ConsistentRead: true,
      ExclusiveStartKey: lastKey,
    }));
    rows.push(...((page.Items ?? []) as OverrideRow[]));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return rows;
}

export async function run(client: ScriptClient, options: ScriptOptions): Promise<RunResult> {
  const tables = tableNamesForStage(options.stage);
  const tagTitles = await listTagTitles(client, tables.championships);

  console.log(`Stage: ${options.stage}`);
  console.log(`Tag titles: ${tagTitles.length}`);

  const toDelete: OverrideRow[] = [];
  let found = 0;
  let inactive = 0;

  for (const title of tagTitles) {
    const playerOverrides = (await listOverrides(client, tables.overrides, title.championshipId))
      .filter(isPlayerOverride);
    if (playerOverrides.length === 0) continue;

    console.log(`\n${title.name ?? title.championshipId} (${title.championshipId}):`);
    for (const override of playerOverrides) {
      found++;
      const state = override.active ? 'active' : 'inactive';
      console.log(`  [${state}] ${JSON.stringify(override)}`);
      if (override.active) {
        toDelete.push(override);
      } else {
        inactive++;
      }
    }
  }

  console.log(`\nPlayer overrides on tag titles: ${found} (${toDelete.length} active, ${inactive} inactive)`);

  if (!options.apply) {
    console.log('Dry run: nothing deleted. Add --apply to delete the active ones.');
    return { tagTitles: tagTitles.length, found, active: toDelete.length, inactive, deleted: 0 };
  }

  let deleted = 0;
  for (const { championshipId, playerId } of toDelete) {
    await client.send(new DeleteCommand({
      TableName: tables.overrides,
      Key: { championshipId, playerId },
    }));
    deleted++;
    console.log(`Deleted override ${championshipId} / ${playerId}`);
  }

  console.log(`Deleted ${deleted} of ${toDelete.length} active player overrides on tag titles.`);
  return { tagTitles: tagTitles.length, found, active: toDelete.length, inactive, deleted };
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
