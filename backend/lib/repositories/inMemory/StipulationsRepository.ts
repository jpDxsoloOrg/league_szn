import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  StipulationCreateInput,
  StipulationPatch,
  StipulationsRepository,
} from '../StipulationsRepository';
import type { Stipulation } from '../types';

export class InMemoryStipulationsRepository implements StipulationsRepository {
  readonly store = new Map<string, Stipulation>();

  async findById(stipulationId: string): Promise<Stipulation | null> {
    return this.store.get(stipulationId) ?? null;
  }

  async list(): Promise<Stipulation[]> {
    return Array.from(this.store.values());
  }

  async create(input: StipulationCreateInput): Promise<Stipulation> {
    const now = new Date().toISOString();
    const item: Stipulation = {
      stipulationId: uuidv4(),
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.stipulationId, item);
    return item;
  }

  async update(stipulationId: string, patch: StipulationPatch): Promise<Stipulation> {
    const existing = this.store.get(stipulationId);
    if (!existing) throw new NotFoundError('Stipulation', stipulationId);
    const updated: Stipulation = {
      ...existing,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      updatedAt: new Date().toISOString(),
    };
    this.store.set(stipulationId, updated);
    return updated;
  }

  async delete(stipulationId: string): Promise<void> {
    this.store.delete(stipulationId);
  }
}
