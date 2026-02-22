import { API_BASE_URL, fetchWithAuth } from './apiClient';

export type CrudApi<TEntity, TCreate> = {
  getAll: (signal?: AbortSignal) => Promise<TEntity[]>;
  create: (data: TCreate) => Promise<TEntity>;
  updateById: (id: string, updates: Partial<TEntity>) => Promise<TEntity>;
  deleteById: (id: string) => Promise<void>;
};

export function createCrudApi<TEntity, TCreate>(endpoint: string): CrudApi<TEntity, TCreate> {
  return {
    getAll: async (signal?: AbortSignal): Promise<TEntity[]> => {
      return fetchWithAuth(`${API_BASE_URL}/${endpoint}`, {}, signal);
    },

    create: async (data: TCreate): Promise<TEntity> => {
      return fetchWithAuth(`${API_BASE_URL}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    updateById: async (id: string, updates: Partial<TEntity>): Promise<TEntity> => {
      return fetchWithAuth(`${API_BASE_URL}/${endpoint}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },

    deleteById: async (id: string): Promise<void> => {
      return fetchWithAuth(`${API_BASE_URL}/${endpoint}/${id}`, {
        method: 'DELETE',
      });
    },
  };
}
