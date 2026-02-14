import { getAuthToken } from './apiClient';

export const authApi = {
  setToken: (token: string) => {
    sessionStorage.setItem('accessToken', token);
  },

  clearToken: () => {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('idToken');
  },

  isAuthenticated: (): boolean => {
    return !!getAuthToken();
  },

  getToken: (): string | null => {
    return getAuthToken();
  },
};
