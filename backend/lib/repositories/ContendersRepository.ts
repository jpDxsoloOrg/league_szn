import type { ContenderRanking, ContenderOverride, RankingHistoryEntry } from './types';

export interface ContenderRankingInput {
  championshipId: string;
  playerId: string;
  rank: number;
  rankingScore: number;
  winPercentage: number;
  currentStreak: number;
  qualityScore?: number;
  recencyScore?: number;
  matchesInPeriod: number;
  winsInPeriod: number;
  previousRank?: number | null;
  peakRank?: number;
  weeksAtTop?: number;
  isOverridden?: boolean;
  overrideType?: string | null;
  organicRank?: number | null;
}

export interface ContenderOverrideInput {
  championshipId: string;
  playerId: string;
  overrideType: 'bump_to_top' | 'send_to_bottom';
  reason: string;
  createdBy: string;
  expiresAt?: string;
}

export interface RankingHistoryInput {
  playerId: string;
  weekKey: string;
  championshipId: string;
  rank: number;
  rankingScore: number;
  movement: number;
  isOverridden?: boolean;
  overrideType?: string | null;
  organicRank?: number | null;
}

export interface ContendersRepository {
  // Rankings
  listByChampionship(championshipId: string): Promise<ContenderRanking[]>;
  listByChampionshipRanked(championshipId: string): Promise<ContenderRanking[]>;
  deleteAllForChampionship(championshipId: string): Promise<void>;
  upsertRanking(input: ContenderRankingInput): Promise<ContenderRanking>;

  // Overrides
  findOverride(championshipId: string, playerId: string): Promise<ContenderOverride | null>;
  listActiveOverrides(championshipId?: string): Promise<ContenderOverride[]>;
  createOverride(input: ContenderOverrideInput): Promise<ContenderOverride>;
  deactivateOverride(championshipId: string, playerId: string, reason: string): Promise<void>;

  // Ranking history
  writeHistory(input: RankingHistoryInput): Promise<RankingHistoryEntry>;
}
