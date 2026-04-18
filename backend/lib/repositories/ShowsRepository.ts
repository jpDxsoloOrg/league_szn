import type { Show } from './types';

export interface ShowCreateInput {
  name: string;
  companyId: string;
  description?: string;
  schedule?: string;
  dayOfWeek?: string;
  imageUrl?: string;
}

export interface ShowPatch {
  name?: string;
  companyId?: string;
  description?: string;
  schedule?: string;
  dayOfWeek?: string;
  imageUrl?: string;
}

export interface ShowsRepository {
  findById(showId: string): Promise<Show | null>;
  list(): Promise<Show[]>;
  listByCompany(companyId: string): Promise<Show[]>;
  create(input: ShowCreateInput): Promise<Show>;
  update(showId: string, patch: ShowPatch): Promise<Show>;
  delete(showId: string): Promise<void>;
}
