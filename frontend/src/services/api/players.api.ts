import type { Player } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const playersApi = {
  getAll: async (signal?: AbortSignal): Promise<Player[]> => {
    return fetchWithAuth(`${API_BASE_URL}/players`, {}, signal);
  },

  create: async (player: Omit<Player, 'playerId' | 'createdAt' | 'updatedAt'>): Promise<Player> => {
    return fetchWithAuth(`${API_BASE_URL}/players`, {
      method: 'POST',
      body: JSON.stringify(player),
    });
  },

  update: async (playerId: string, updates: Omit<Partial<Player>, 'alignment'> & { alignment?: 'face' | 'heel' | 'neutral' | '' }): Promise<Player> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${playerId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  getById: async (playerId: string, signal?: AbortSignal): Promise<Player> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${playerId}`, {}, signal);
  },

  delete: async (playerId: string): Promise<void> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${playerId}`, {
      method: 'DELETE',
    });
  },
};
