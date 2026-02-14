import type { Championship, ChampionshipReign } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const championshipsApi = {
  getAll: async (signal?: AbortSignal): Promise<Championship[]> => {
    return fetchWithAuth(`${API_BASE_URL}/championships`, {}, signal);
  },

  create: async (championship: Omit<Championship, 'championshipId' | 'createdAt'>): Promise<Championship> => {
    return fetchWithAuth(`${API_BASE_URL}/championships`, {
      method: 'POST',
      body: JSON.stringify(championship),
    });
  },

  getHistory: async (championshipId: string, signal?: AbortSignal): Promise<ChampionshipReign[]> => {
    return fetchWithAuth(`${API_BASE_URL}/championships/${championshipId}/history`, {}, signal);
  },

  update: async (championshipId: string, updates: Partial<Championship>): Promise<Championship> => {
    return fetchWithAuth(`${API_BASE_URL}/championships/${championshipId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (championshipId: string): Promise<void> => {
    return fetchWithAuth(`${API_BASE_URL}/championships/${championshipId}`, {
      method: 'DELETE',
    });
  },

  vacate: async (championshipId: string): Promise<Championship> => {
    return fetchWithAuth(`${API_BASE_URL}/championships/${championshipId}/vacate`, {
      method: 'POST',
    });
  },
};
