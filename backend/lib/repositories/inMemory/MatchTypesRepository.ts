import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  MatchTypeCreateInput,
  MatchTypePatch,
  MatchTypesRepository,
} from '../MatchTypesRepository';
import type { MatchType } from '../types';

export class InMemoryMatchTypesRepository implements MatchTypesRepository {
  readonly store = new Map<string, MatchType>();

  async findById(matchTypeId: string): Promise<MatchType | null> {
    return this.store.get(matchTypeId) ?? null;
  }

  async list(): Promise<MatchType[]> {
    return Array.from(this.store.values());
  }

  async create(input: MatchTypeCreateInput): Promise<MatchType> {
    const now = new Date().toISOString();
    const item: MatchType = {
      matchTypeId: uuidv4(),
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.matchTypeId, item);
    return item;
  }

  async update(matchTypeId: string, patch: MatchTypePatch): Promise<MatchType> {
    const existing = this.store.get(matchTypeId);
    if (!existing) throw new NotFoundError('MatchType', matchTypeId);
    const updated: MatchType = {
      ...existing,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      updatedAt: new Date().toISOString(),
    };
    this.store.set(matchTypeId, updated);
    return updated;
  }

  async delete(matchTypeId: string): Promise<void> {
    this.store.delete(matchTypeId);
  }
}
