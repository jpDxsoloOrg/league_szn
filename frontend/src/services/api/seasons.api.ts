import type { Season } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const seasonsApi = {
  getAll: async (signal?: AbortSignal): Promise<Season[]> => {
    return fetchWithAuth(`${API_BASE_URL}/seasons`, {}, signal);
  },

  create: async (season: { name: string; startDate: string; endDate?: string }): Promise<Season> => {
    return fetchWithAuth(`${API_BASE_URL}/seasons`, {
      method: 'POST',
      body: JSON.stringify(season),
    });
  },

  update: async (seasonId: string, updates: Partial<Season>): Promise<Season> => {
    return fetchWithAuth(`${API_BASE_URL}/seasons/${seasonId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (seasonId: string): Promise<void> => {
    return fetchWithAuth(`${API_BASE_URL}/seasons/${seasonId}`, {
      method: 'DELETE',
    });
  },
};
