import type { Standings } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const standingsApi = {
  get: async (seasonId?: string, signal?: AbortSignal): Promise<Standings> => {
    const params = seasonId ? `?seasonId=${seasonId}` : '';
    return fetchWithAuth(`${API_BASE_URL}/standings${params}`, {}, signal);
  },
};
