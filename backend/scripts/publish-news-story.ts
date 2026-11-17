/**
 * Publishes a feature news story from a JSON file in `scripts/news/` as a
 * News announcement. The story keeps a fixed `announcementId`, so its link
 * (`/news/<id>`) is the same on dev and prod and re-running it only updates
 * the story.
 *
 * Dry run (prints what would be written, changes nothing):
 *   AWS_PROFILE=league-szn npx ts-node scripts/publish-news-story.ts scripts/news/2026-11-16-mayhem-monday.json --stage devtest
 *
 * Write:
 *   AWS_PROFILE=league-szn npx ts-node scripts/publish-news-story.ts scripts/news/2026-11-16-mayhem-monday.json --stage devtest --apply
 *
 * Stage `dev` is production and `devtest` is the dev site.
 */

import { readFileSync } from 'fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const SERVICE = 'wwe-2k-league-api';
const STAGE_PATTERN = /^[a-zA-Z0-9-]+$/;

export interface NewsStoryFile {
  announcementId: string;
  title: string;
  body: string;
  priority: number;
  layout: 'feature';
  heroImageUrl?: string;
  heroAlt?: string;
  kicker?: string;
  dek?: string;
  byline?: string;
  showAsPopup?: boolean;
  createdAt: string;
}

export interface PublishOptions {
  file: string;
  stage: string;
  apply: boolean;
}

export function parseArgs(args: readonly string[]): PublishOptions {
  let file: string | undefined;
  let stage: string | undefined;
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply') apply = true;
    else if (arg === '--stage') stage = args[++index];
    else if (arg.startsWith('--stage=')) stage = arg.slice('--stage='.length);
    else if (!arg.startsWith('--')) file = arg;
  }
  if (!file) throw new Error('A story JSON file is required');
  if (!stage || !STAGE_PATTERN.test(stage)) {
    throw new Error('--stage <stage> is required (dev is production, devtest is the dev site)');
  }
  return { file, stage, apply };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`Story field "${field}" is required`);
  return value;
}

export function readStory(raw: unknown): NewsStoryFile {
  if (typeof raw !== 'object' || raw === null) throw new Error('Story file must contain a JSON object');
  const story = raw as Record<string, unknown>;
  if (story.layout !== 'feature') throw new Error('Story field "layout" must be "feature"');
  if (typeof story.priority !== 'number') throw new Error('Story field "priority" must be a number');
  requireString(story.announcementId, 'announcementId');
  requireString(story.title, 'title');
  requireString(story.body, 'body');
  requireString(story.createdAt, 'createdAt');
  return story as unknown as NewsStoryFile;
}

/** The DynamoDB item: an active, news-only announcement carrying the feature fields. */
export function toAnnouncementItem(story: NewsStoryFile, now: string): Record<string, unknown> {
  return {
    ...story,
    isActive: 'true',
    showAsPopup: story.showAsPopup ?? false,
    createdBy: 'league-wire',
    updatedAt: now,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const story = readStory(JSON.parse(readFileSync(options.file, 'utf8')));
  const tableName = `${SERVICE}-announcements-${options.stage}`;
  const item = toAnnouncementItem(story, new Date().toISOString());

  console.log(`Stage: ${options.stage}  Table: ${tableName}`);
  console.log(`Story: ${story.title}`);
  console.log(`Link:  /news/${story.announcementId}`);
  if (!options.apply) {
    console.log('Dry run: nothing written. Add --apply to publish.');
    return;
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
  await client.send(new PutCommand({ TableName: tableName, Item: item }));
  console.log('Published.');
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
