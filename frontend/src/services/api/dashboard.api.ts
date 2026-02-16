import type { DashboardData } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const dashboardApi = {
  get: async (signal?: AbortSignal): Promise<DashboardData> => {
    return fetchWithAuth(`${API_BASE_URL}/dashboard`, {}, signal);
  },
};
