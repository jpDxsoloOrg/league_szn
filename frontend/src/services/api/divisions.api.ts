import type { Division } from '../../types';
import { createCrudApi } from './crudFactory';

const baseDivisionsApi = createCrudApi<Division, { name: string; description?: string }>('divisions');

export const divisionsApi = {
  getAll: async (signal?: AbortSignal): Promise<Division[]> => {
    return baseDivisionsApi.getAll(signal);
  },

  create: async (division: { name: string; description?: string }): Promise<Division> => {
    return baseDivisionsApi.create(division);
  },

  update: async (divisionId: string, updates: Partial<Division>): Promise<Division> => {
    return baseDivisionsApi.updateById(divisionId, updates);
  },

  delete: async (divisionId: string): Promise<void> => {
    return baseDivisionsApi.deleteById(divisionId);
  },
};
