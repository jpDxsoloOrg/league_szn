import type { Stipulation } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const stipulationsApi = {
  getAll: async (signal?: AbortSignal): Promise<Stipulation[]> => {
    return fetchWithAuth(`${API_BASE_URL}/stipulations`, {}, signal);
  },

  bulkCreate: async (names: string[]): Promise<{ created: number; stipulations: Stipulation[] }> => {
    return fetchWithAuth(`${API_BASE_URL}/stipulations/bulk`, {
      method: 'POST',
      body: JSON.stringify({ names }),
    });
  },

  create: async (stipulation: { name: string; description?: string }): Promise<Stipulation> => {
    return fetchWithAuth(`${API_BASE_URL}/stipulations`, {
      method: 'POST',
      body: JSON.stringify(stipulation),
    });
  },

  update: async (stipulationId: string, updates: Partial<Stipulation>): Promise<Stipulation> => {
    return fetchWithAuth(`${API_BASE_URL}/stipulations/${stipulationId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (stipulationId: string): Promise<void> => {
    return fetchWithAuth(`${API_BASE_URL}/stipulations/${stipulationId}`, {
      method: 'DELETE',
    });
  },
};
