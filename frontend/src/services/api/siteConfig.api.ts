import { API_BASE_URL, fetchWithAuth } from './apiClient';

export interface SiteFeatures {
  fantasy: boolean;
  challenges: boolean;
  promos: boolean;
  contenders: boolean;
  statistics: boolean;
  stables: boolean;
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
};
