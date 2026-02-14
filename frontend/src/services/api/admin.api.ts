import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const adminApi = {
  clearAll: async (): Promise<{ message: string; deletedCounts: Record<string, number> }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/clear-all`, {
      method: 'DELETE',
    });
  },

  seedData: async (): Promise<{ message: string; createdCounts: Record<string, number> }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/seed-data`, {
      method: 'POST',
    });
  },
};
