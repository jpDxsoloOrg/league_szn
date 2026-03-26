import { TableNames } from '../../lib/dynamodb';

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

export interface ExportTableConfig {
  key: ExportDatasetKey;
  tableName: string;
  partitionKey: string;
  sortKey?: string;
}

export const EXPORT_SCHEMA_VERSION = 1;

export const EXPORT_TABLES: readonly ExportTableConfig[] = [
  { key: 'divisions', tableName: TableNames.DIVISIONS, partitionKey: 'divisionId' },
  { key: 'players', tableName: TableNames.PLAYERS, partitionKey: 'playerId' },
  { key: 'seasons', tableName: TableNames.SEASONS, partitionKey: 'seasonId' },
  { key: 'seasonStandings', tableName: TableNames.SEASON_STANDINGS, partitionKey: 'seasonId', sortKey: 'playerId' },
  { key: 'championships', tableName: TableNames.CHAMPIONSHIPS, partitionKey: 'championshipId' },
  {
    key: 'championshipHistory',
    tableName: TableNames.CHAMPIONSHIP_HISTORY,
    partitionKey: 'championshipId',
    sortKey: 'wonDate',
  },
  { key: 'matches', tableName: TableNames.MATCHES, partitionKey: 'matchId', sortKey: 'date' },
  { key: 'tournaments', tableName: TableNames.TOURNAMENTS, partitionKey: 'tournamentId' },
  { key: 'events', tableName: TableNames.EVENTS, partitionKey: 'eventId' },
  {
    key: 'contenderRankings',
    tableName: TableNames.CONTENDER_RANKINGS,
    partitionKey: 'championshipId',
    sortKey: 'playerId',
  },
  {
    key: 'contenderOverrides',
    tableName: TableNames.CONTENDER_OVERRIDES,
    partitionKey: 'championshipId',
    sortKey: 'playerId',
  },
  { key: 'rankingHistory', tableName: TableNames.RANKING_HISTORY, partitionKey: 'playerId', sortKey: 'weekKey' },
  { key: 'fantasyConfig', tableName: TableNames.FANTASY_CONFIG, partitionKey: 'configKey' },
  { key: 'wrestlerCosts', tableName: TableNames.WRESTLER_COSTS, partitionKey: 'playerId' },
  { key: 'fantasyPicks', tableName: TableNames.FANTASY_PICKS, partitionKey: 'eventId', sortKey: 'fantasyUserId' },
  { key: 'siteConfig', tableName: TableNames.SITE_CONFIG, partitionKey: 'configKey' },
  { key: 'challenges', tableName: TableNames.CHALLENGES, partitionKey: 'challengeId' },
  { key: 'promos', tableName: TableNames.PROMOS, partitionKey: 'promoId' },
  { key: 'stipulations', tableName: TableNames.STIPULATIONS, partitionKey: 'stipulationId' },
  { key: 'matchTypes', tableName: TableNames.MATCH_TYPES, partitionKey: 'matchTypeId' },
  { key: 'seasonAwards', tableName: TableNames.SEASON_AWARDS, partitionKey: 'seasonId', sortKey: 'awardId' },
] as const;

export type ExportData = Record<ExportDatasetKey, Record<string, unknown>[]>;

export interface SeedImportPayload {
  version: number;
  exportedAt: string;
  stage: string;
  data: ExportData;
}
