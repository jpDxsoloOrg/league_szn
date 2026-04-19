import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type { CrudRepository } from '../CrudRepository';

export interface InMemoryCrudConfig<T, TCreate> {
  idField: keyof T & string;
  entityName: string;
  buildItem: (input: TCreate, id: string, now: string) => T;
}

export class InMemoryCrudRepository<T, TCreate, TPatch extends object>
  implements CrudRepository<T, TCreate, TPatch>
{
  readonly store = new Map<string, T>();

  constructor(private config: InMemoryCrudConfig<T, TCreate>) {}

  async findById(id: string): Promise<T | null> {
    return this.store.get(id) ?? null;
  }

  async list(): Promise<T[]> {
    return Array.from(this.store.values());
  }

  async create(input: TCreate): Promise<T> {
    const now = new Date().toISOString();
    const item = this.config.buildItem(input, uuidv4(), now);
    this.store.set((item as Record<string, unknown>)[this.config.idField] as string, item);
    return item;
  }

  async update(id: string, patch: TPatch): Promise<T> {
    const existing = this.store.get(id);
    if (!existing) throw new NotFoundError(this.config.entityName, id);
    const updated: T = {
      ...existing,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      updatedAt: new Date().toISOString(),
    } as T;
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
