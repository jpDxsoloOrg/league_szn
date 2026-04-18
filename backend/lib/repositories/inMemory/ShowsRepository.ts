import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  ShowCreateInput,
  ShowPatch,
  ShowsRepository,
} from '../ShowsRepository';
import type { Show } from '../types';

export class InMemoryShowsRepository implements ShowsRepository {
  readonly store = new Map<string, Show>();

  async findById(showId: string): Promise<Show | null> {
    return this.store.get(showId) ?? null;
  }

  async list(): Promise<Show[]> {
    const items = Array.from(this.store.values());
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return items;
  }

  async listByCompany(companyId: string): Promise<Show[]> {
    const items = Array.from(this.store.values()).filter((s) => s.companyId === companyId);
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return items;
  }

  async create(input: ShowCreateInput): Promise<Show> {
    const now = new Date().toISOString();
    const item: Show = {
      showId: uuidv4(),
      name: input.name,
      companyId: input.companyId,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.schedule !== undefined ? { schedule: input.schedule } : {}),
      ...(input.dayOfWeek !== undefined ? { dayOfWeek: input.dayOfWeek } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.showId, item);
    return item;
  }

  async update(showId: string, patch: ShowPatch): Promise<Show> {
    const existing = this.store.get(showId);
    if (!existing) throw new NotFoundError('Show', showId);
    const updated: Show = {
      ...existing,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      updatedAt: new Date().toISOString(),
    };
    this.store.set(showId, updated);
    return updated;
  }

  async delete(showId: string): Promise<void> {
    this.store.delete(showId);
  }
}
