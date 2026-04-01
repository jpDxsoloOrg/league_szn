import type { ChampionshipContenders, ContenderOverride, SetOverrideRequest } from '../../types/contender';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const contendersApi = {
  getForChampionship: async (championshipId: string, signal?: AbortSignal): Promise<ChampionshipContenders> => {
    return fetchWithAuth(`${API_BASE_URL}/championships/${championshipId}/contenders`, {}, signal);
  },

  recalculate: async (
    championshipId?: string,
    config?: {
      rankingPeriodDays?: number;
      minimumMatches?: number;
      maxContenders?: number;
      includeDraws?: boolean;
      divisionRestricted?: boolean;
    },
  ): Promise<{ message: string; summary: Record<string, number> }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/contenders/recalculate`, {
      method: 'POST',
      body: JSON.stringify({
        ...(championshipId ? { championshipId } : {}),
        ...(config || {}),
      }),
    });
  },

  setOverride: async (body: SetOverrideRequest): Promise<ContenderOverride> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/contenders/overrides`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  removeOverride: async (championshipId: string, playerId: string): Promise<void> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/contenders/overrides/${championshipId}/${playerId}`, {
      method: 'DELETE',
    });
  },

  getOverrides: async (championshipId?: string): Promise<ContenderOverride[]> => {
    const query = championshipId ? `?championshipId=${championshipId}` : '';
    return fetchWithAuth(`${API_BASE_URL}/admin/contenders/overrides${query}`, {});
  },
};
