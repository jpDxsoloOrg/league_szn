import type { Show } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const showsApi = {
  getAll: async (filters?: { companyId?: string }, signal?: AbortSignal): Promise<Show[]> => {
    const params = new URLSearchParams();
    if (filters?.companyId) params.set('companyId', filters.companyId);
    const query = params.toString();
    return fetchWithAuth(`${API_BASE_URL}/shows${query ? `?${query}` : ''}`, {}, signal);
  },

  getById: async (showId: string): Promise<Show> => {
    return fetchWithAuth(`${API_BASE_URL}/shows/${showId}`);
  },

  create: async (show: { name: string; companyId: string; description?: string; schedule?: 'weekly' | 'ppv' | 'special'; dayOfWeek?: string; imageUrl?: string }): Promise<Show> => {
    return fetchWithAuth(`${API_BASE_URL}/shows`, {
      method: 'POST',
      body: JSON.stringify(show),
    });
  },

  update: async (showId: string, updates: Partial<Show>): Promise<Show> => {
    return fetchWithAuth(`${API_BASE_URL}/shows/${showId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (showId: string): Promise<void> => {
    return fetchWithAuth(`${API_BASE_URL}/shows/${showId}`, {
      method: 'DELETE',
    });
  },
};
