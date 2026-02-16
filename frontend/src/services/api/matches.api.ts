import type { Match, ScheduleMatchInput } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const matchesApi = {
  getAll: async (filters?: { status?: string }, signal?: AbortSignal): Promise<Match[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
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
};
