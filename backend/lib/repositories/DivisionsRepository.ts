import type { Division } from './types';

export interface DivisionCreateInput {
  name: string;
  description?: string;
}

export interface DivisionPatch {
  name?: string;
  description?: string;
}

export interface DivisionsRepository {
  findById(divisionId: string): Promise<Division | null>;
  list(): Promise<Division[]>;
  create(input: DivisionCreateInput): Promise<Division>;
  update(divisionId: string, patch: DivisionPatch): Promise<Division>;
  delete(divisionId: string): Promise<void>;
}
