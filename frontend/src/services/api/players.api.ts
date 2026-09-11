import type { Player, PlayerBookingInfo, SuspendPlayerInput, SuspensionRow } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const playersApi = {
  getAll: async (signal?: AbortSignal): Promise<Player[]> => {
    return fetchWithAuth(`${API_BASE_URL}/players`, {}, signal);
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

  /** Staff only. Active suspensions with computed eligibility, eligible rows first. */
  getSuspensions: async (signal?: AbortSignal): Promise<SuspensionRow[]> => {
    return fetchWithAuth(`${API_BASE_URL}/players/suspensions`, {}, signal);
  },

  /** Staff only. Exactly one of `until` / `showsRequired` must be set. 409 if already suspended. */
  suspend: async (playerId: string, input: SuspendPlayerInput): Promise<Player> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${playerId}/suspend`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** Staff only. Clears the suspension. 404 if the player is not suspended. */
  reinstate: async (playerId: string): Promise<Player> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${playerId}/reinstate`, {
      method: 'POST',
    });
  },
};
