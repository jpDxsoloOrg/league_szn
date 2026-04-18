import type { Season } from './types';

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

export interface SeasonsRepository {
  findById(seasonId: string): Promise<Season | null>;
  list(): Promise<Season[]>;
  findActive(): Promise<Season | null>;
  create(input: SeasonCreateInput): Promise<Season>;
  update(seasonId: string, patch: SeasonPatch): Promise<Season>;
  delete(seasonId: string): Promise<void>;
}
