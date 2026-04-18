import type { SeasonAward } from './types';

export interface SeasonAwardCreateInput {
  seasonId: string;
  name: string;
  awardType: string;
  playerId: string;
  playerName: string;
  description?: string | null;
}

export interface SeasonAwardsRepository {
  listBySeason(seasonId: string): Promise<SeasonAward[]>;
  findById(seasonId: string, awardId: string): Promise<SeasonAward | null>;
  create(input: SeasonAwardCreateInput): Promise<SeasonAward>;
  delete(seasonId: string, awardId: string): Promise<void>;
  deleteAllForSeason(seasonId: string): Promise<number>;
}
