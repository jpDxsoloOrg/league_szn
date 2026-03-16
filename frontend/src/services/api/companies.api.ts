import type { Company } from '../../types';
import { createCrudApi } from './crudFactory';

const baseCrud = createCrudApi<Company, { name: string; abbreviation?: string; description?: string; imageUrl?: string }>('companies');

export const companiesApi = {
  getAll: async (signal?: AbortSignal): Promise<Company[]> => {
    return baseCrud.getAll(signal);
  },

  getById: async (companyId: string): Promise<Company> => {
    const { API_BASE_URL, fetchWithAuth } = await import('./apiClient');
    return fetchWithAuth(`${API_BASE_URL}/companies/${companyId}`);
  },

  create: async (company: { name: string; abbreviation?: string; description?: string; imageUrl?: string }): Promise<Company> => {
    return baseCrud.create(company);
  },

  update: async (companyId: string, updates: Partial<Company>): Promise<Company> => {
    return baseCrud.updateById(companyId, updates);
  },

  delete: async (companyId: string): Promise<void> => {
    return baseCrud.deleteById(companyId);
  },
};
