import { API_BASE_URL, fetchWithAuth } from './apiClient';

export interface SiteFeatures {
  challenges: boolean;
  promos: boolean;
  contenders: boolean;
  statistics: boolean;
  stables: boolean;
  notifications: boolean;
  rivalries: boolean;
}

/**
 * Admin-tunable knobs for the rivalry-heat formula. Mirrors the
 * `RivalryHeatTunables` interface on the backend.
 */
export interface RivalryHeatTunables {
  pivot: number;
  maxWeight: number;
  scoreCap: number;
  motnMultiplier: number;
  promoBase: number;
  promoReactionStep: number;
  promoBonusCap: number;
  promoMaxReactionCount: number;
}

export const siteConfigApi = {
  getFeatures: async (signal?: AbortSignal): Promise<{ features: SiteFeatures }> => {
    return fetchWithAuth(`${API_BASE_URL}/site-config`, {}, signal);
  },

  updateFeatures: async (features: Partial<SiteFeatures>): Promise<{ features: SiteFeatures }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/site-config`, {
      method: 'PUT',
      body: JSON.stringify({ features }),
    });
  },

  getHeatTunables: async (signal?: AbortSignal): Promise<{ tunables: RivalryHeatTunables }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/heat-config`, {}, signal);
  },

  updateHeatTunables: async (
    tunables: Partial<RivalryHeatTunables>,
  ): Promise<{ tunables: RivalryHeatTunables }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/heat-config`, {
      method: 'PUT',
      body: JSON.stringify({ tunables }),
    });
  },
};
