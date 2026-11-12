/**
 * Backfills TTC-10: links tag championship reigns to the tag team that won them.
 *
 * For every history entry of a tag title that has no `tagTeamId`, the two
 * champions are looked up against every tag team that ever existed (all
 * statuses) and the team active on the reign's `wonDate` is recorded. Titles
 * currently held by a team also get `currentTagTeamId`. Random pairings are
 * left alone. Existing links are never overwritten.
 *
 * Dry run (prints counts, changes nothing):
 *   AWS_PROFILE=league-szn npm run backfill-tag-reigns -- --stage devtest
 *
 * Write:
 *   AWS_PROFILE=league-szn npm run backfill-tag-reigns -- --stage devtest --apply
 *
 * Stage `dev` is production and `devtest` is the dev site. Stage `offline` uses
 * DynamoDB Local (DYNAMODB_ENDPOINT, default http://localhost:8000).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Championship, ChampionshipHistoryEntry, TagTeam } from '../lib/repositories/types';
import { buildTagTeamIndex, resolveTeamForPair } from '../lib/tagTeams/resolveTagTeams';
import type { TagTeamIndex } from '../lib/tagTeams/resolveTagTeams';

const SERVICE = 'wwe-2k-league-api';
const OFFLINE_STAGE = 'offline';
const STAGE_PATTERN = /^[a-zA-Z0-9-]+$/;

export interface ScriptOptions {
  stage: string;
  apply: boolean;
}

export interface TableNamesForStage {
  championships: string;
  history: string;
  tagTeams: string;
}

export interface ReignLink {
  championshipId: string;
  wonDate: string;
  tagTeamId: string;
}

export interface TitleLink {
  championshipId: string;
  tagTeamId: string;
}

export interface BackfillPlan {
  /** History entries on tag titles. */
  tagReigns: number;
  /** Tag reigns that already carry a tagTeamId. */
  alreadyLinked: number;
  /** Tag reigns that will be linked. */
  reignLinks: ReignLink[];
  /** Tag reigns whose holders were not a registered team on the won date. */
  unmatched: number;
  /** Tag titles whose current holders will get currentTagTeamId. */
  titleLinks: TitleLink[];
  /** Tag titles that already have a different currentTagTeamId; left alone. */
  titleConflicts: number;
}

export interface RunResult extends BackfillPlan {
  reignsWritten: number;
  titlesWritten: number;
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

export function tableNamesForStage(stage: string): TableNamesForStage {
  return {
    championships: `${SERVICE}-championships-${stage}`,
    history: `${SERVICE}-championship-history-${stage}`,
    tagTeams: `${SERVICE}-tag-teams-${stage}`,
  };
}

function holderIds(holder: string | string[] | undefined): string[] {
  if (!holder) return [];
  return Array.isArray(holder) ? holder : [holder];
}

function teamFor(index: TagTeamIndex, holder: string | string[] | undefined, atDate: string): string | null {
  const ids = holderIds(holder);
  if (ids.length !== 2) return null;
  return resolveTeamForPair(index, ids[0], ids[1], atDate)?.tagTeamId ?? null;
}

function sameHolders(first: string | string[] | undefined, second: string | string[] | undefined): boolean {
  const firstIds = [...holderIds(first)].sort();
  const secondIds = [...holderIds(second)].sort();
  return firstIds.length === secondIds.length && firstIds.every((id, i) => id === secondIds[i]);
}

/** Works out every write the backfill would make. Pure: no I/O. */
export function planBackfill(
  championships: readonly Championship[],
  history: readonly ChampionshipHistoryEntry[],
  teams: readonly TagTeam[],
): BackfillPlan {
  const index = buildTagTeamIndex(teams);
  const tagTitles = new Map(
    championships.filter((title) => title.type === 'tag').map((title) => [title.championshipId, title]),
  );

  const plan: BackfillPlan = {
    tagReigns: 0,
    alreadyLinked: 0,
    reignLinks: [],
    unmatched: 0,
    titleLinks: [],
    titleConflicts: 0,
  };
  // championshipId -> team of its open reign, linked or about to be.
  const openReignTeam = new Map<string, { wonDate: string; tagTeamId: string | null; champion: string | string[] }>();

  for (const reign of history) {
    if (!tagTitles.has(reign.championshipId)) continue;
    plan.tagReigns++;

    let tagTeamId: string | null = reign.tagTeamId ?? null;
    if (tagTeamId) {
      plan.alreadyLinked++;
    } else {
      tagTeamId = teamFor(index, reign.champion, reign.wonDate);
      if (tagTeamId) {
        plan.reignLinks.push({ championshipId: reign.championshipId, wonDate: reign.wonDate, tagTeamId });
      } else {
        plan.unmatched++;
      }
    }

    if (!reign.lostDate) {
      const previous = openReignTeam.get(reign.championshipId);
      if (!previous || previous.wonDate < reign.wonDate) {
        openReignTeam.set(reign.championshipId, { wonDate: reign.wonDate, tagTeamId, champion: reign.champion });
      }
    }
  }

  for (const title of tagTitles.values()) {
    if (holderIds(title.currentChampion).length === 0) continue;
    const open = openReignTeam.get(title.championshipId);
    // Prefer the open reign's team when it is the same pair; otherwise resolve now.
    const tagTeamId = open && sameHolders(open.champion, title.currentChampion)
      ? open.tagTeamId
      : teamFor(index, title.currentChampion, new Date().toISOString());
    if (!tagTeamId) continue;
    if (title.currentTagTeamId === tagTeamId) continue;
    if (title.currentTagTeamId) {
      plan.titleConflicts++;
      continue;
    }
    plan.titleLinks.push({ championshipId: title.championshipId, tagTeamId });
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
  const tables = tableNamesForStage(options.stage);
  const [championships, history, teams] = await Promise.all([
    scanAll<Championship>(client, tables.championships),
    scanAll<ChampionshipHistoryEntry>(client, tables.history),
    scanAll<TagTeam>(client, tables.tagTeams),
  ]);

  const plan = planBackfill(championships, history, teams);
  const tagTitleCount = championships.filter((title) => title.type === 'tag').length;

  console.log(`Stage: ${options.stage}`);
  console.log(`Tag titles: ${tagTitleCount}, tag teams (all statuses): ${teams.length}`);
  console.log(`Tag reigns: ${plan.tagReigns}`);
  console.log(`  already linked: ${plan.alreadyLinked}`);
  console.log(`  matched to a team: ${plan.reignLinks.length}`);
  console.log(`  no team (random pairing or not two holders): ${plan.unmatched}`);
  console.log(`Current tag champions to link: ${plan.titleLinks.length}`);
  if (plan.titleConflicts > 0) {
    console.log(`  skipped, already linked to a different team: ${plan.titleConflicts}`);
  }

  if (!options.apply) {
    console.log('Dry run: nothing written. Add --apply to write these links.');
    return { ...plan, reignsWritten: 0, titlesWritten: 0 };
  }

  let reignsWritten = 0;
  for (const link of plan.reignLinks) {
    try {
      await client.send(new UpdateCommand({
        TableName: tables.history,
        Key: { championshipId: link.championshipId, wonDate: link.wonDate },
        UpdateExpression: 'SET tagTeamId = :tagTeamId',
        ConditionExpression: 'attribute_exists(championshipId) AND attribute_not_exists(tagTeamId)',
        ExpressionAttributeValues: { ':tagTeamId': link.tagTeamId },
      }));
      reignsWritten++;
    } catch (err) {
      if (!isConditionFailure(err)) throw err;
      console.log(`  skipped reign ${link.championshipId} @ ${link.wonDate}: changed since the scan`);
    }
  }

  let titlesWritten = 0;
  for (const link of plan.titleLinks) {
    try {
      await client.send(new UpdateCommand({
        TableName: tables.championships,
        Key: { championshipId: link.championshipId },
        UpdateExpression: 'SET currentTagTeamId = :tagTeamId',
        ConditionExpression: 'attribute_exists(championshipId) AND attribute_not_exists(currentTagTeamId)',
        ExpressionAttributeValues: { ':tagTeamId': link.tagTeamId },
      }));
      titlesWritten++;
    } catch (err) {
      if (!isConditionFailure(err)) throw err;
      console.log(`  skipped title ${link.championshipId}: changed since the scan`);
    }
  }

  console.log(`Wrote ${reignsWritten} of ${plan.reignLinks.length} reign links and ${titlesWritten} of ${plan.titleLinks.length} title links.`);
  return { ...plan, reignsWritten, titlesWritten };
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
