import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  CompanyCreateInput,
  CompanyPatch,
  CompaniesRepository,
} from '../CompaniesRepository';
import type { Company } from '../types';

export class InMemoryCompaniesRepository implements CompaniesRepository {
  readonly store = new Map<string, Company>();

  async findById(companyId: string): Promise<Company | null> {
    return this.store.get(companyId) ?? null;
  }

  async list(): Promise<Company[]> {
    const items = Array.from(this.store.values());
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return items;
  }

  async create(input: CompanyCreateInput): Promise<Company> {
    const now = new Date().toISOString();
    const item: Company = {
      companyId: uuidv4(),
      name: input.name,
      ...(input.abbreviation !== undefined ? { abbreviation: input.abbreviation } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.companyId, item);
    return item;
  }

  async update(companyId: string, patch: CompanyPatch): Promise<Company> {
    const existing = this.store.get(companyId);
    if (!existing) throw new NotFoundError('Company', companyId);
    const updated: Company = {
      ...existing,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      updatedAt: new Date().toISOString(),
    };
    this.store.set(companyId, updated);
    return updated;
  }

  async delete(companyId: string): Promise<void> {
    this.store.delete(companyId);
  }
}
