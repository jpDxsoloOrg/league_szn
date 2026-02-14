import type { FantasyConfig, WrestlerCost, WrestlerWithCost, FantasyPicks, FantasyLeaderboardEntry } from '../../types/fantasy';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const fantasyApi = {
  // Config
  getConfig: async (signal?: AbortSignal): Promise<FantasyConfig> => {
    return fetchWithAuth(`${API_BASE_URL}/fantasy/config`, {}, signal);
  },

  updateConfig: async (updates: Partial<FantasyConfig>): Promise<FantasyConfig> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/fantasy/config`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  // Wrestler Costs
  getWrestlerCosts: async (signal?: AbortSignal): Promise<WrestlerWithCost[]> => {
    return fetchWithAuth(`${API_BASE_URL}/fantasy/wrestlers/costs`, {}, signal);
  },

  initializeWrestlerCosts: async (baseCost?: number): Promise<{ message: string; count: number }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/fantasy/wrestlers/costs/initialize`, {
      method: 'POST',
      body: JSON.stringify(baseCost ? { baseCost } : {}),
    });
  },

  recalculateWrestlerCosts: async (): Promise<{ message: string; playersUpdated: number }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/fantasy/wrestlers/costs/recalculate`, {
      method: 'POST',
    });
  },

  updateWrestlerCost: async (playerId: string, cost: number, reason?: string): Promise<WrestlerCost> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/fantasy/wrestlers/${playerId}/cost`, {
      method: 'PUT',
      body: JSON.stringify({ currentCost: cost, reason }),
    });
  },

  // Leaderboard
  getLeaderboard: async (seasonId?: string, signal?: AbortSignal): Promise<FantasyLeaderboardEntry[]> => {
    const params = seasonId ? `?seasonId=${seasonId}` : '';
    return fetchWithAuth(`${API_BASE_URL}/fantasy/leaderboard${params}`, {}, signal);
  },

  // Scoring
  scoreCompletedEvents: async (): Promise<{ message: string; scoredEventIds: string[] }> => {
    return fetchWithAuth(`${API_BASE_URL}/fantasy/score`, {
      method: 'POST',
    });
  },

  // Picks
  submitPicks: async (eventId: string, picks: Record<string, string[]>): Promise<FantasyPicks> => {
    return fetchWithAuth(`${API_BASE_URL}/fantasy/picks/${eventId}`, {
      method: 'POST',
      body: JSON.stringify({ picks }),
    });
  },

  getUserPicks: async (eventId: string, signal?: AbortSignal): Promise<FantasyPicks> => {
    return fetchWithAuth(`${API_BASE_URL}/fantasy/picks/${eventId}`, {}, signal);
  },

  getAllMyPicks: async (signal?: AbortSignal): Promise<FantasyPicks[]> => {
    return fetchWithAuth(`${API_BASE_URL}/fantasy/me/picks`, {}, signal);
  },

  clearPicks: async (eventId: string): Promise<void> => {
    return fetchWithAuth(`${API_BASE_URL}/fantasy/picks/${eventId}`, {
      method: 'DELETE',
    });
  },
};
