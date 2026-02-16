import { API_BASE_URL, fetchWithAuth } from './apiClient';
import type { DashboardData } from '../../types';

export const dashboardApi = {
    get: async (signal?: AbortSignal): Promise<DashboardData> => {
        return fetchWithAuth(`${API_BASE_URL}/dashboard`, {}, signal);
    },
};
