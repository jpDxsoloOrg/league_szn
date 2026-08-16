import type { ActiveOverride, Player } from '../../types';
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

  /**
   * Admin override for active status. `true` forces active, `false` forces
   * inactive, `null` reverts to derived (has-completed-a-match-this-season).
   */
  setActiveStatus: async (
    playerId: string,
    value: boolean | null
  ): Promise<{ playerId: string; isActive: boolean; activeOverride: ActiveOverride | null }> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${playerId}/active-status`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
  },

  delete: async (playerId: string): Promise<void> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${playerId}`, {
      method: 'DELETE',
    });
  },
};
