import type { Player, PlayerBookingInfo } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

/** Public name lookup row. `currentWrestler` is null for a player with no wrestler. */
export interface PlayerDirectoryEntry {
  playerId: string;
  name: string;
  currentWrestler: string | null;
}

/** Staff edit of a player. The clear flags empty a slot, including one held by name alone. */
export type PlayerUpdate = Omit<Partial<Player>, 'alignment'> & {
  alignment?: 'face' | 'heel' | 'neutral' | '';
  clearCurrentWrestler?: boolean;
  clearAlternateWrestler?: boolean;
};

export const playersApi = {
  /** Players with a wrestler. Hidden players are left out. */
  getAll: async (signal?: AbortSignal): Promise<Player[]> => {
    return fetchWithAuth(`${API_BASE_URL}/players`, {}, signal);
  },

  /** Staff only: every player, including hidden ones. Others get the public list. */
  getAllIncludingHidden: async (signal?: AbortSignal): Promise<Player[]> => {
    return fetchWithAuth(`${API_BASE_URL}/players?includeHidden=true`, {}, signal);
  },

  /** Public name lookup covering all players, so old matches can resolve names. */
  getDirectory: async (signal?: AbortSignal): Promise<PlayerDirectoryEntry[]> => {
    return fetchWithAuth(`${API_BASE_URL}/players?view=directory`, {}, signal);
  },

  /** Staff only. Keyed by playerId. */
  getBookingSummary: async (signal?: AbortSignal): Promise<Record<string, PlayerBookingInfo>> => {
    return fetchWithAuth(`${API_BASE_URL}/players/booking-summary`, {}, signal);
  },

  create: async (player: Omit<Player, 'playerId' | 'createdAt' | 'updatedAt'>): Promise<Player> => {
    return fetchWithAuth(`${API_BASE_URL}/players`, {
      method: 'POST',
      body: JSON.stringify(player),
    });
  },

  update: async (playerId: string, updates: PlayerUpdate): Promise<Player> => {
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
