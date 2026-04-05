import type { WrestlerOverall, WrestlerOverallWithPlayer } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const overallsApi = {
  getMyOverall: async (): Promise<WrestlerOverall> => {
    return fetchWithAuth(`${API_BASE_URL}/players/me/overall`);
  },

  submitOverall: async (data: { mainOverall: number; alternateOverall?: number }): Promise<WrestlerOverall> => {
    return fetchWithAuth(`${API_BASE_URL}/players/me/overall`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  getAllOveralls: async (): Promise<WrestlerOverallWithPlayer[]> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/overalls`);
  },
};
