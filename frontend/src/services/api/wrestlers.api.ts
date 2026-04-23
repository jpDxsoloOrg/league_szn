import type { Wrestler, WrestlerImportResult, WrestlerPromotion } from '../../types';
import { createCrudApi } from './crudFactory';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

type WrestlerCreatePayload = {
  promotion: WrestlerPromotion;
  name: string;
  overallCap: number;
};

const baseWrestlersApi = createCrudApi<Wrestler, WrestlerCreatePayload>('wrestlers');

export const wrestlersApi = {
  getAll: async (signal?: AbortSignal): Promise<Wrestler[]> => {
    return baseWrestlersApi.getAll(signal);
  },

  create: async (wrestler: WrestlerCreatePayload): Promise<Wrestler> => {
    return baseWrestlersApi.create(wrestler);
  },

  update: async (wrestlerId: string, updates: Partial<Wrestler>): Promise<Wrestler> => {
    return baseWrestlersApi.updateById(wrestlerId, updates);
  },

  delete: async (wrestlerId: string): Promise<void> => {
    return baseWrestlersApi.deleteById(wrestlerId);
  },

  importBulk: async (wrestlers: WrestlerCreatePayload[]): Promise<WrestlerImportResult> => {
    return fetchWithAuth(`${API_BASE_URL}/wrestlers/import`, {
      method: 'POST',
      body: JSON.stringify({ wrestlers }),
    });
  },
};
