/**
 * One-off (CUP-04): creates the default Young Boys call-up track if the
 * developmental division has no call-up track yet. Goals: 10 matches
 * competed, 3.0+ star average over 5+ rated matches, 3 promos with 3+
 * reactions each, 5 wins, equal weights. `toDivisionId` is left unset.
 * Touches only the progression-tracks table (reads divisions).
 *
 * The developmental division is the one flagged `isDevelopmental` (oldest
 * first); failing that, the default division for new wrestlers, which
 * itself falls back to the "Young Boys" name.
 *
 * Dry run (prints the plan, changes nothing):
 *   AWS_PROFILE=league-szn npm run seed-default-callup-track -- --stage devtest
 *
 * Write:
 *   AWS_PROFILE=league-szn npm run seed-default-callup-track -- --stage devtest --apply
 *
 * Stage `dev` is production and `devtest` is the dev site. Stage `offline` uses
 * DynamoDB Local (DYNAMODB_ENDPOINT, default http://localhost:8000).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { findDefaultDivisionForNewWrestlers, findDevelopmentalDivisions } from '../lib/divisions';
import { buildDefaultCallupTrack } from '../lib/progression/defaultTracks';
import type { Division, ProgressionTrack } from '../lib/repositories/types';

const SERVICE = 'wwe-2k-league-api';
const OFFLINE_STAGE = 'offline';
const STAGE_PATTERN = /^[a-zA-Z0-9-]+$/;

export interface ScriptOptions {
  stage: string;
  apply: boolean;
}

export type SeedPlan =
  | { action: 'no-division' }
  | { action: 'exists'; division: Division; existing: ProgressionTrack }
  | { action: 'create'; division: Division; source: string; track: ProgressionTrack };

export interface RunResult {
  plan: SeedPlan;
  applied: boolean;
  /** False when the tracks table does not exist yet (dry run only). */
  tracksTableFound: boolean;
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

export function tableNamesForStage(stage: string): { divisions: string; tracks: string } {
  return {
    divisions: `${SERVICE}-divisions-${stage}`,
    tracks: `${SERVICE}-progression-tracks-${stage}`,
  };
}

/** The developmental division: flagged first, else the new-wrestler default (with its name fallback). */
export function pickDevelopmentalDivision(
  divisions: Division[],
  warn: (message: string) => void = console.warn,
): { division: Division; source: string } | undefined {
  const flagged = findDevelopmentalDivisions(divisions);
  if (flagged.length > 0) {
    if (flagged.length > 1) {
      warn(`Several developmental divisions (${flagged.map((d) => d.name).join(', ')}); using ${flagged[0].name}`);
    }
    return { division: flagged[0], source: 'isDevelopmental flag' };
  }
  const fallback = findDefaultDivisionForNewWrestlers(divisions, warn);
  if (!fallback.division) return undefined;
  return {
    division: fallback.division,
    source: fallback.source === 'flag' ? 'isDefaultForNewWrestlers flag' : 'name match',
  };
}

export function planSeed(
  divisions: Division[],
  tracks: ProgressionTrack[],
  now: string,
  newId: () => string = uuidv4,
): SeedPlan {
  const picked = pickDevelopmentalDivision(divisions);
  if (!picked) return { action: 'no-division' };
  const existing = tracks.find(
    (track) => track.kind === 'callup' && track.fromDivisionId === picked.division.divisionId,
  );
  if (existing) return { action: 'exists', division: picked.division, existing };
  return {
    action: 'create',
    division: picked.division,
    source: picked.source,
    track: buildDefaultCallupTrack({ trackId: newId(), fromDivisionId: picked.division.divisionId, now }),
  };
}

async function scanAll<T>(client: ScriptClient, tableName: string): Promise<T[]> {
  const rows: T[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const page = await client.send(new ScanCommand({ TableName: tableName, ConsistentRead: true, ExclusiveStartKey: lastKey }));
    rows.push(...((page.Items ?? []) as T[]));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return rows;
}

function isMissingTable(err: unknown): boolean {
  return err instanceof Error && err.name === 'ResourceNotFoundException';
}

export async function run(client: ScriptClient, options: ScriptOptions): Promise<RunResult> {
  const tables = tableNamesForStage(options.stage);
  const divisions = await scanAll<Division>(client, tables.divisions);

  let tracks: ProgressionTrack[] = [];
  let tracksTableFound = true;
  try {
    tracks = await scanAll<ProgressionTrack>(client, tables.tracks);
  } catch (err) {
    if (!isMissingTable(err) || options.apply) throw err;
    tracksTableFound = false;
  }

  console.log(`Divisions table: ${tables.divisions} (${divisions.length} rows)`);
  console.log(
    `Tracks table: ${tables.tracks} (${tracksTableFound ? `${tracks.length} rows` : 'NOT FOUND: deploy the stack before --apply'})`,
  );

  const plan = planSeed(divisions, tracks, new Date().toISOString());
  if (plan.action === 'no-division') {
    console.log('No developmental division found (no flag, no "Young Boys" name). Nothing to do.');
    return { plan, applied: false, tracksTableFound };
  }
  if (plan.action === 'exists') {
    console.log(
      `"${plan.division.name}" already has call-up track "${plan.existing.name}" (${plan.existing.trackId}). Nothing to do.`,
    );
    return { plan, applied: false, tracksTableFound };
  }

  console.log(`Developmental division: "${plan.division.name}" (${plan.division.divisionId}) via ${plan.source}`);
  console.log(`Would create track "${plan.track.name}" (${plan.track.trackId}), windowMode ${plan.track.windowMode}:`);
  for (const goal of plan.track.goals) {
    const params = goal.params ? ` ${JSON.stringify(goal.params)}` : '';
    console.log(`  ${goal.metric} >= ${goal.threshold} (weight ${goal.weight})${params}`);
  }

  if (!options.apply) {
    console.log('Dry run: nothing written. Add --apply to create the track.');
    return { plan, applied: false, tracksTableFound };
  }

  await client.send(new PutCommand({
    TableName: tables.tracks,
    Item: plan.track,
    ConditionExpression: 'attribute_not_exists(trackId)',
  }));
  console.log('Applied. Players are scored on the next progression recompute.');
  return { plan, applied: true, tracksTableFound };
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
  return DynamoDBDocumentClient.from(dynamoClient, { marshallOptions: { removeUndefinedValues: true } });
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
