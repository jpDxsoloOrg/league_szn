import type { ChampionshipContenders } from '../../types/contender';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const contendersApi = {
  getForChampionship: async (championshipId: string, signal?: AbortSignal): Promise<ChampionshipContenders> => {
    return fetchWithAuth(`${API_BASE_URL}/championships/${championshipId}/contenders`, {}, signal);
  },

  recalculate: async (championshipId?: string): Promise<{ message: string; summary: Record<string, number> }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/contenders/recalculate`, {
      method: 'POST',
      body: JSON.stringify(championshipId ? { championshipId } : {}),
    });
  },
};
