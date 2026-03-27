import type { Match, MatchFilters, ScheduleMatchInput } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const matchesApi = {
  getAll: async (filters?: MatchFilters, signal?: AbortSignal): Promise<Match[]> => {
    const params = new URLSearchParams();
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value) params.set(key, value);
      }
    }
    const query = params.toString();
    return fetchWithAuth(`${API_BASE_URL}/matches${query ? `?${query}` : ''}`, {}, signal);
  },

  schedule: async (match: ScheduleMatchInput): Promise<Match> => {
    return fetchWithAuth(`${API_BASE_URL}/matches`, {
      method: 'POST',
      body: JSON.stringify(match),
    });
  },

  recordResult: async (
    matchId: string,
    result: {
      winners: string[];
      losers: string[];
      isDraw?: boolean;
      winningTeam?: number;
      starRating?: number;
      matchOfTheNight?: boolean;
    }
  ): Promise<Match> => {
    return fetchWithAuth(`${API_BASE_URL}/matches/${matchId}/result`, {
      method: 'PUT',
      body: JSON.stringify(result),
    });
  },

  delete: async (matchId: string): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/matches/${matchId}`, {
      method: 'DELETE',
    });
  },
};
