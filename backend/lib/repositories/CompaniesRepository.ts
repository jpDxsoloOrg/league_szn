import type { Company } from './types';

export interface CompanyCreateInput {
  name: string;
  abbreviation?: string;
  imageUrl?: string;
  description?: string;
}

export interface CompanyPatch {
  name?: string;
  abbreviation?: string;
  imageUrl?: string;
  description?: string;
}

export interface CompaniesRepository {
  findById(companyId: string): Promise<Company | null>;
  list(): Promise<Company[]>;
  create(input: CompanyCreateInput): Promise<Company>;
  update(companyId: string, patch: CompanyPatch): Promise<Company>;
  delete(companyId: string): Promise<void>;
}
