import type { CrudRepository } from './CrudRepository';
import type {
  Match,
  Championship,
  ChampionshipHistoryEntry,
  Tournament,
  ContenderRanking,
  ContenderOverride,
  RankingHistoryEntry,
  MatchType,
  Stipulation,
} from './types';

// ─── Match input types (uses Record<string, unknown> per original) ──

// No named create/patch types — matches use Record<string, unknown>

// ─── Championship input types ───────────────────────────────────────

export interface ChampionshipCreateInput {
  name: string;
  type: 'singles' | 'tag';
  currentChampion?: string | string[];
  divisionId?: string;
  imageUrl?: string;
  [key: string]: unknown;
}

export interface ChampionshipPatch {
  name?: string;
  type?: 'singles' | 'tag';
  currentChampion?: string | string[] | null;
  imageUrl?: string;
  isActive?: boolean;
  defenses?: number;
}

// ─── Contender input types ──────────────────────────────────────────

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

// ─── Match Type input types ─────────────────────────────────────────

export interface MatchTypeCreateInput {
  name: string;
  description?: string;
}

export interface MatchTypePatch {
  name?: string;
  description?: string;
}

// ─── Stipulation input types ────────────────────────────────────────

export interface StipulationCreateInput {
  name: string;
  description?: string;
}

export interface StipulationPatch {
  name?: string;
  description?: string;
}

// ─── Sub-interfaces ─────────────────────────────────────────────────

export interface MatchesMethods {
  findById(matchId: string): Promise<Match | null>;
  /** Find a match by matchId, also returning its sort key (date). */
  findByIdWithDate(matchId: string): Promise<(Match & { date: string }) | null>;
  list(): Promise<Match[]>;
  listCompleted(): Promise<Match[]>;
  listByStatus(status: string): Promise<Match[]>;
  listByTournament(tournamentId: string): Promise<Match[]>;
  listBySeason(seasonId: string): Promise<Match[]>;
  create(input: Record<string, unknown>): Promise<Match>;
  update(matchId: string, date: string, patch: Record<string, unknown>): Promise<Match>;
  delete(matchId: string, date: string): Promise<void>;
}

export interface ChampionshipsMethods {
  findById(championshipId: string): Promise<Championship | null>;
  list(): Promise<Championship[]>;
  listActive(): Promise<Championship[]>;
  create(input: ChampionshipCreateInput): Promise<Championship>;
  update(championshipId: string, patch: ChampionshipPatch): Promise<Championship>;
  delete(championshipId: string): Promise<void>;
  removeChampion(championshipId: string): Promise<Championship>;

  // Championship history
  listHistory(championshipId: string): Promise<ChampionshipHistoryEntry[]>;
  listAllHistory(): Promise<ChampionshipHistoryEntry[]>;
  findCurrentReign(championshipId: string): Promise<ChampionshipHistoryEntry | null>;
  closeReign(championshipId: string, wonDate: string, lostDate: string, daysHeld: number): Promise<void>;
  reopenReign(championshipId: string, wonDate: string): Promise<void>;
  deleteHistoryEntry(championshipId: string, wonDate: string): Promise<void>;
  incrementDefenses(championshipId: string, wonDate: string): Promise<void>;
  decrementDefenses(championshipId: string, wonDate: string): Promise<void>;
}

export interface TournamentsMethods {
  findById(tournamentId: string): Promise<Tournament | null>;
  list(): Promise<Tournament[]>;
  create(input: Record<string, unknown>): Promise<Tournament>;
  update(tournamentId: string, patch: Partial<Tournament>): Promise<Tournament>;
}

export interface ContendersMethods {
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

// ─── Aggregate interface ────────────────────────────────────────────

export interface CompetitionRepository {
  matches: MatchesMethods;
  championships: ChampionshipsMethods;
  tournaments: TournamentsMethods;
  contenders: ContendersMethods;
  matchTypes: CrudRepository<MatchType, MatchTypeCreateInput, MatchTypePatch>;
  stipulations: CrudRepository<Stipulation, StipulationCreateInput, StipulationPatch>;
}
