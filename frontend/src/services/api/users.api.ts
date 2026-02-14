import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const usersApi = {
  list: async (signal?: AbortSignal): Promise<{
    users: Array<{
      username: string;
      sub: string;
      email: string;
      name: string;
      wrestlerName: string;
      status: string;
      enabled: boolean;
      created: string;
      groups: string[];
    }>;
  }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/users`, {}, signal);
  },

  updateRole: async (username: string, role: string, action: 'promote' | 'demote'): Promise<{
    message: string;
    username: string;
    groups: string[];
  }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/users/role`, {
      method: 'POST',
      body: JSON.stringify({ username, role, action }),
    });
  },

  toggleEnabled: async (username: string, enabled: boolean): Promise<{
    message: string;
    username: string;
    enabled: boolean;
  }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/users/toggle-enabled`, {
      method: 'POST',
      body: JSON.stringify({ username, enabled }),
    });
  },
};
