import type { Stipulation } from './types';

export interface StipulationCreateInput {
  name: string;
  description?: string;
}

export interface StipulationPatch {
  name?: string;
  description?: string;
}

export interface StipulationsRepository {
  findById(stipulationId: string): Promise<Stipulation | null>;
  list(): Promise<Stipulation[]>;
  create(input: StipulationCreateInput): Promise<Stipulation>;
  update(stipulationId: string, patch: StipulationPatch): Promise<Stipulation>;
  delete(stipulationId: string): Promise<void>;
}
