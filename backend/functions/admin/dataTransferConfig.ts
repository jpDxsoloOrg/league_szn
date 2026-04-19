export type ExportDatasetKey =
  | 'divisions'
  | 'players'
  | 'seasons'
  | 'seasonStandings'
  | 'championships'
  | 'championshipHistory'
  | 'matches'
  | 'tournaments'
  | 'events'
  | 'contenderRankings'
  | 'contenderOverrides'
  | 'rankingHistory'
  | 'fantasyConfig'
  | 'wrestlerCosts'
  | 'fantasyPicks'
  | 'siteConfig'
  | 'challenges'
  | 'promos'
  | 'stipulations'
  | 'matchTypes'
  | 'seasonAwards';

export const EXPORT_SCHEMA_VERSION = 1;

export const EXPORT_DATASET_KEYS: readonly string[] = [
  'divisions', 'players', 'seasons', 'seasonStandings', 'championships',
  'championshipHistory', 'matches', 'tournaments', 'events',
  'contenderRankings', 'contenderOverrides', 'rankingHistory',
  'fantasyConfig', 'wrestlerCosts', 'fantasyPicks', 'siteConfig',
  'challenges', 'promos', 'stipulations', 'matchTypes', 'seasonAwards',
];

export type ExportData = Record<ExportDatasetKey, Record<string, unknown>[]>;

export interface SeedImportPayload {
  version: number;
  exportedAt: string;
  stage: string;
  data: ExportData;
}
