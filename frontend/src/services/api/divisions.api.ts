import type { Division } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';
import { createCrudApi } from './crudFactory';

/** `tier: null` clears the tier. */
export type DivisionUpdate = Omit<Partial<Division>, 'tier'> & { tier?: number | null };

const baseDivisionsApi = createCrudApi<Division, { name: string; description?: string }>('divisions');

export const divisionsApi = {
  getAll: async (signal?: AbortSignal): Promise<Division[]> => {
    return baseDivisionsApi.getAll(signal);
  },

  create: async (division: {
    name: string;
    description?: string;
    isDevelopmental?: boolean;
    isDefaultForNewWrestlers?: boolean;
    tier?: number;
  }): Promise<Division> => {
    return baseDivisionsApi.create(division);
  },

  // Called directly rather than through updateById, whose Partial<Division>
  // payload has no room for `tier: null`.
  update: async (divisionId: string, updates: DivisionUpdate): Promise<Division> => {
    return fetchWithAuth(`${API_BASE_URL}/divisions/${divisionId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (divisionId: string): Promise<void> => {
    return baseDivisionsApi.deleteById(divisionId);
  },
};
