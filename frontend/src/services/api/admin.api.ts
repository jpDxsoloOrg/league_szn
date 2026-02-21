import { API_BASE_URL, fetchWithAuth } from './apiClient';

export interface SeedImportPayload {
  version: number;
  exportedAt: string;
  stage: string;
  data: Record<string, Record<string, unknown>[]>;
}

export interface SeedExportResponse extends SeedImportPayload {
  counts: Record<string, number>;
}

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

  exportData: async (): Promise<SeedExportResponse> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/export-data`, {
      method: 'GET',
    });
  },

  importData: async (
    payload: SeedImportPayload
  ): Promise<{ message: string; mode: 'import'; createdCounts: Record<string, number> }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/seed-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'import',
        payload,
      }),
    });
  },
};
