/**
 * Backfills CUP-01: sets `divisionJoinedAt` on players that have a division
 * but no join date, using the player's `createdAt`. Progression tracks with
 * `windowMode: 'sinceJoinedDivision'` read this field.
 *
 * Players with no `divisionId` are left alone; they get a join date when they
 * are first placed in a division. Existing values are never overwritten, and
 * `updatedAt` is not touched.
 *
 * Dry run (prints counts, changes nothing):
 *   AWS_PROFILE=league-szn npm run backfill-division-joined-at -- --stage devtest
 *
 * Write:
 *   AWS_PROFILE=league-szn npm run backfill-division-joined-at -- --stage devtest --apply
 *
 * Stage `dev` is production and `devtest` is the dev site. Stage `offline` uses
 * DynamoDB Local (DYNAMODB_ENDPOINT, default http://localhost:8000).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Player } from '../lib/repositories/types';

const SERVICE = 'wwe-2k-league-api';
const OFFLINE_STAGE = 'offline';
const STAGE_PATTERN = /^[a-zA-Z0-9-]+$/;

export interface ScriptOptions {
  stage: string;
  apply: boolean;
}

export interface JoinDateWrite {
  playerId: string;
  divisionJoinedAt: string;
}

export interface BackfillPlan {
  /** Every player row, soft-deleted included. */
  players: number;
  /** Players with a division that already have a join date. */
  alreadySet: number;
  /** Players with no division; nothing to backfill. */
  noDivision: number;
  /** Players with a division but no createdAt to copy; skipped. */
  missingCreatedAt: number;
  writes: JoinDateWrite[];
}

export interface RunResult extends BackfillPlan {
  written: number;
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

export function playersTableForStage(stage: string): string {
  return `${SERVICE}-players-${stage}`;
}

/** Works out every write the backfill would make. Pure: no I/O. */
export function planBackfill(players: readonly Player[]): BackfillPlan {
  const plan: BackfillPlan = {
    players: players.length,
    alreadySet: 0,
    noDivision: 0,
    missingCreatedAt: 0,
    writes: [],
  };

  for (const player of players) {
    if (!player.divisionId) {
      plan.noDivision++;
    } else if (player.divisionJoinedAt) {
      plan.alreadySet++;
    } else if (!player.createdAt) {
      plan.missingCreatedAt++;
    } else {
      plan.writes.push({ playerId: player.playerId, divisionJoinedAt: player.createdAt });
    }
  }

  return plan;
}

async function scanAll<T>(client: ScriptClient, tableName: string): Promise<T[]> {
  const rows: T[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const page = await client.send(new ScanCommand({
      TableName: tableName,
      ConsistentRead: true,
      ExclusiveStartKey: lastKey,
    }));
    rows.push(...((page.Items ?? []) as T[]));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return rows;
}

function isConditionFailure(err: unknown): boolean {
  return err instanceof Error && err.name === 'ConditionalCheckFailedException';
}

export async function run(client: ScriptClient, options: ScriptOptions): Promise<RunResult> {
  const tableName = playersTableForStage(options.stage);
  const players = await scanAll<Player>(client, tableName);
  const plan = planBackfill(players);

  console.log(`Stage: ${options.stage}`);
  console.log(`Players: ${plan.players}`);
  console.log(`  no division (left alone): ${plan.noDivision}`);
  console.log(`  already have divisionJoinedAt: ${plan.alreadySet}`);
  console.log(`  missing createdAt (skipped): ${plan.missingCreatedAt}`);
  console.log(`  to backfill from createdAt: ${plan.writes.length}`);

  if (!options.apply) {
    console.log('Dry run: nothing written. Add --apply to write these join dates.');
    return { ...plan, written: 0 };
  }

  let written = 0;
  for (const write of plan.writes) {
    try {
      await client.send(new UpdateCommand({
        TableName: tableName,
        Key: { playerId: write.playerId },
        UpdateExpression: 'SET divisionJoinedAt = :joinedAt',
        ConditionExpression:
          'attribute_exists(playerId) AND attribute_exists(divisionId) AND attribute_not_exists(divisionJoinedAt)',
        ExpressionAttributeValues: { ':joinedAt': write.divisionJoinedAt },
      }));
      written++;
    } catch (err) {
      if (!isConditionFailure(err)) throw err;
      console.log(`  skipped player ${write.playerId}: changed since the scan`);
    }
  }

  console.log(`Wrote ${written} of ${plan.writes.length} join dates.`);
  return { ...plan, written };
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
