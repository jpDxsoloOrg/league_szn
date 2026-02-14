import type { Division } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const divisionsApi = {
  getAll: async (signal?: AbortSignal): Promise<Division[]> => {
    return fetchWithAuth(`${API_BASE_URL}/divisions`, {}, signal);
  },

  create: async (division: { name: string; description?: string }): Promise<Division> => {
    return fetchWithAuth(`${API_BASE_URL}/divisions`, {
      method: 'POST',
      body: JSON.stringify(division),
    });
  },

  update: async (divisionId: string, updates: Partial<Division>): Promise<Division> => {
    return fetchWithAuth(`${API_BASE_URL}/divisions/${divisionId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (divisionId: string): Promise<void> => {
    return fetchWithAuth(`${API_BASE_URL}/divisions/${divisionId}`, {
      method: 'DELETE',
    });
  },
};
