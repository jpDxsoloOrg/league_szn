/**
 * Every dataset the admin export, import and clear operations cover. This is
 * the single list: `lib/repositories/dynamo/adminOps.ts` keys its table map by
 * `ExportDatasetKey`, so the compiler rejects any drift between the two.
 */
export const EXPORT_DATASET_KEYS = [
  'divisions',
  'players',
  'seasons',
  'seasonStandings',
  'championships',
  'championshipHistory',
  'matches',
  'tournaments',
  'events',
  'contenderRankings',
  'contenderOverrides',
  'rankingHistory',
  'siteConfig',
  'challenges',
  'promos',
  'stipulations',
  'matchTypes',
  'seasonAwards',
  'rivalries',
  'rivalryMessages',
  'rivalryNotes',
  'matchRatings',
] as const;

export type ExportDatasetKey = (typeof EXPORT_DATASET_KEYS)[number];

export const EXPORT_SCHEMA_VERSION = 1;

/**
 * A dataset can be absent: exports made before a dataset was added lack it, and
 * an export leaves out any table it could not read. Import only touches the
 * tables whose dataset is present.
 */
export type ExportData = Partial<Record<ExportDatasetKey, Record<string, unknown>[]>>;

export interface SeedImportPayload {
  version: number;
  exportedAt: string;
  stage: string;
  data: ExportData;
}

/**
 * Stages where operations that replace every table may run. This is an
 * allow-list so an unknown or unset stage is refused. The serverless stage
 * named `dev` is production and must never be added here.
 */
const BULK_DATA_STAGES: readonly string[] = ['devtest', 'offline'];

export const BULK_DATA_BLOCKED_MESSAGE =
  'This operation replaces all league data and is disabled in this environment';

/** Local runs talk to DynamoDB Local, so they are allowed whatever the stage. */
export function isBulkDataOperationAllowed(): boolean {
  return (
    process.env.IS_OFFLINE === 'true' ||
    BULK_DATA_STAGES.includes(process.env.STAGE ?? '')
  );
}
