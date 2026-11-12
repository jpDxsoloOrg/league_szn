import type { ChampionshipContenders, ContenderOverride, SetOverrideRequest, SetOverrideResult } from '../../types/contender';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export type {
  ContenderChampion,
  ContenderListEntry,
  ContenderMember,
  ContenderWithPlayer,
  ContenderWithTagTeam,
  PlayerContenderChampion,
  TagTeamContenderChampion,
} from '../../types/contender';

export const contendersApi = {
  /**
   * Rankings for one title. On a tag title, rows are `ContenderWithTagTeam`
   * (`entityType: 'tagTeam'`) and `currentChampion` is a
   * `TagTeamContenderChampion` (`type: 'tagTeam'`) listing every holder.
   * Singles rows and champions carry neither field.
   */
  getForChampionship: async (championshipId: string, signal?: AbortSignal): Promise<ChampionshipContenders> => {
    return fetchWithAuth(`${API_BASE_URL}/championships/${championshipId}/contenders`, {}, signal);
  },

  setOverride: async (body: SetOverrideRequest): Promise<SetOverrideResult> => {
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
