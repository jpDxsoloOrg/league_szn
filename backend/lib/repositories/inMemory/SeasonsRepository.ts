import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  SeasonCreateInput,
  SeasonPatch,
  SeasonsRepository,
} from '../SeasonsRepository';
import type { Season } from '../types';

export class InMemorySeasonsRepository implements SeasonsRepository {
  readonly store = new Map<string, Season>();

  async findById(seasonId: string): Promise<Season | null> {
    return this.store.get(seasonId) ?? null;
  }

  async list(): Promise<Season[]> {
    const items = Array.from(this.store.values());
    items.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    return items;
  }

  async findActive(): Promise<Season | null> {
    return Array.from(this.store.values()).find((s) => s.status === 'active') ?? null;
  }

  async create(input: SeasonCreateInput): Promise<Season> {
    const now = new Date().toISOString();
    const item: Season = {
      seasonId: uuidv4(),
      name: input.name,
      startDate: input.startDate,
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.seasonId, item);
    return item;
  }

  async update(seasonId: string, patch: SeasonPatch): Promise<Season> {
    const existing = this.store.get(seasonId);
    if (!existing) throw new NotFoundError('Season', seasonId);

    const now = new Date().toISOString();
    const updated: Season = { ...existing, updatedAt: now };

    if (patch.name !== undefined) updated.name = patch.name;
    if (patch.status !== undefined) updated.status = patch.status;
    if (patch.endDate !== undefined) updated.endDate = patch.endDate;

    // Auto-set endDate when completing
    if (patch.status === 'completed' && !patch.endDate && !existing.endDate) {
      updated.endDate = now;
    }

    this.store.set(seasonId, updated);
    return updated;
  }

  async delete(seasonId: string): Promise<void> {
    this.store.delete(seasonId);
  }
}
