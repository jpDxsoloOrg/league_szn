import type { MatchType } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const matchTypesApi = {
  getAll: async (signal?: AbortSignal): Promise<MatchType[]> => {
    return fetchWithAuth(`${API_BASE_URL}/match-types`, {}, signal);
  },

  create: async (matchType: { name: string; description?: string }): Promise<MatchType> => {
    return fetchWithAuth(`${API_BASE_URL}/match-types`, {
      method: 'POST',
      body: JSON.stringify(matchType),
    });
  },

  update: async (matchTypeId: string, updates: Partial<MatchType>): Promise<MatchType> => {
    return fetchWithAuth(`${API_BASE_URL}/match-types/${matchTypeId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (matchTypeId: string): Promise<void> => {
    return fetchWithAuth(`${API_BASE_URL}/match-types/${matchTypeId}`, {
      method: 'DELETE',
    });
  },
};
