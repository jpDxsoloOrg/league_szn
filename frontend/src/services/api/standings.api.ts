import type { Standings } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const standingsApi = {
  get: async (
    seasonId?: string,
    signal?: AbortSignal,
    options?: { includeInactive?: boolean }
  ): Promise<Standings> => {
    const query = new URLSearchParams();
    if (seasonId) query.set('seasonId', seasonId);
    if (options?.includeInactive) query.set('includeInactive', 'true');
    const params = query.toString() ? `?${query}` : '';
    return fetchWithAuth(`${API_BASE_URL}/standings${params}`, {}, signal);
  },
};
