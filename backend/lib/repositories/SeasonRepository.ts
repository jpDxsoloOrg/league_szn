import type { CrudRepository } from './CrudRepository';
import type { Season, SeasonStanding, SeasonAward } from './types';
import type { RecordDelta } from './unitOfWork';

// ─── Season input types ─────────────────────────────────────────────

export interface SeasonCreateInput {
  name: string;
  startDate: string;
  endDate?: string;
}

export interface SeasonPatch {
  name?: string;
  endDate?: string;
  status?: 'active' | 'completed';
}

// ─── Season Award input types ───────────────────────────────────────

export interface SeasonAwardCreateInput {
  seasonId: string;
  name: string;
  awardType: string;
  playerId: string;
  playerName: string;
  description?: string | null;
}

// ─── Sub-interfaces ─────────────────────────────────────────────────

export interface StandingsMethods {
  listBySeason(seasonId: string): Promise<SeasonStanding[]>;
  listByPlayer(playerId: string): Promise<SeasonStanding[]>;
  findStanding(seasonId: string, playerId: string): Promise<SeasonStanding | null>;
  increment(seasonId: string, playerId: string, delta: RecordDelta): Promise<void>;
  delete(seasonId: string, playerId: string): Promise<void>;
  deleteAllForSeason(seasonId: string): Promise<void>;
}

export interface AwardsMethods {
  listBySeason(seasonId: string): Promise<SeasonAward[]>;
  findById(seasonId: string, awardId: string): Promise<SeasonAward | null>;
  create(input: SeasonAwardCreateInput): Promise<SeasonAward>;
  delete(seasonId: string, awardId: string): Promise<void>;
  deleteAllForSeason(seasonId: string): Promise<number>;
}

// ─── Aggregate interface ────────────────────────────────────────────

export interface SeasonRepository {
  seasons: CrudRepository<Season, SeasonCreateInput, SeasonPatch> & {
    findActive(): Promise<Season | null>;
  };
  standings: StandingsMethods;
  awards: AwardsMethods;
}
