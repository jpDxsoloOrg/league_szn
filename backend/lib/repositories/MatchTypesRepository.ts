import type { MatchType } from './types';

export interface MatchTypeCreateInput {
  name: string;
  description?: string;
}

export interface MatchTypePatch {
  name?: string;
  description?: string;
}

export interface MatchTypesRepository {
  findById(matchTypeId: string): Promise<MatchType | null>;
  list(): Promise<MatchType[]>;
  create(input: MatchTypeCreateInput): Promise<MatchType>;
  update(matchTypeId: string, patch: MatchTypePatch): Promise<MatchType>;
  delete(matchTypeId: string): Promise<void>;
}
