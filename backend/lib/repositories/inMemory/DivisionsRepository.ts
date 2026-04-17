import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  DivisionCreateInput,
  DivisionPatch,
  DivisionsRepository,
} from '../DivisionsRepository';
import type { Division } from '../types';

export class InMemoryDivisionsRepository implements DivisionsRepository {
  readonly store = new Map<string, Division>();

  async findById(divisionId: string): Promise<Division | null> {
    return this.store.get(divisionId) ?? null;
  }

  async list(): Promise<Division[]> {
    return Array.from(this.store.values());
  }

  async create(input: DivisionCreateInput): Promise<Division> {
    const now = new Date().toISOString();
    const item: Division = {
      divisionId: uuidv4(),
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.divisionId, item);
    return item;
  }

  async update(divisionId: string, patch: DivisionPatch): Promise<Division> {
    const existing = this.store.get(divisionId);
    if (!existing) throw new NotFoundError('Division', divisionId);
    const updated: Division = {
      ...existing,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      updatedAt: new Date().toISOString(),
    };
    this.store.set(divisionId, updated);
    return updated;
  }

  async delete(divisionId: string): Promise<void> {
    this.store.delete(divisionId);
  }
}
