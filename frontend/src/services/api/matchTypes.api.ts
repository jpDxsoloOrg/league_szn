import type { MatchType } from '../../types';
import { createCrudApi } from './crudFactory';

const baseMatchTypesApi = createCrudApi<MatchType, { name: string; description?: string }>('match-types');

export const matchTypesApi = {
  getAll: async (signal?: AbortSignal): Promise<MatchType[]> => {
    return baseMatchTypesApi.getAll(signal);
  },

  create: async (matchType: { name: string; description?: string }): Promise<MatchType> => {
    return baseMatchTypesApi.create(matchType);
  },

  update: async (matchTypeId: string, updates: Partial<MatchType>): Promise<MatchType> => {
    return baseMatchTypesApi.updateById(matchTypeId, updates);
  },

  delete: async (matchTypeId: string): Promise<void> => {
    return baseMatchTypesApi.deleteById(matchTypeId);
  },
};
