import { API_BASE_URL, fetchWithAuth } from './apiClient';
import type { InjuryConfigResponse, InjuryTunables, InjuryTunablesInput } from '../../types/injury';

export const injuriesApi = {
  /** GET /admin/injury-config (Moderator and Admin): current tunables and kept versions. */
  getConfig: async (signal?: AbortSignal): Promise<InjuryConfigResponse> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/injury-config`, {}, signal);
  },

  /**
   * PUT /admin/injury-config (Admin only). Chance bands, severities and the
   * format multiplier map replace the stored ones. With `expectedVersion`, a
   * save over a newer version fails with a 409.
   */
  updateConfig: async (
    settings: InjuryTunablesInput,
    expectedVersion?: number,
  ): Promise<{ settings: InjuryTunables }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/injury-config`, {
      method: 'PUT',
      body: JSON.stringify({ settings, expectedVersion }),
    });
  },
};
