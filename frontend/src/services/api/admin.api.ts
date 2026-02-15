import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const adminApi = {
  clearAll: async (): Promise<{ message: string; deletedCounts: Record<string, number> }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/clear-all`, {
      method: 'DELETE',
    });
  },

  seedData: async (options?: {
    modules?: string[];
  }): Promise<{ message: string; createdCounts: Record<string, number> }> => {
    const body =
      options?.modules != null && options.modules.length > 0
        ? JSON.stringify({ modules: options.modules })
        : undefined;
    return fetchWithAuth(`${API_BASE_URL}/admin/seed-data`, {
      method: 'POST',
      headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
      body,
    });
  },
};
