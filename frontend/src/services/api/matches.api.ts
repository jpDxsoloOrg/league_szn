import type { Match, MatchFilters, ScheduleMatchInput } from '../../types';
import type { RivalryHeat } from '../../types/rivalry';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

/**
 * Response returned by POST /matches/{matchId}/ratings. Includes the
 * updated per-match aggregate plus, when the match belongs to an active
 * rivalry, the recomputed rivalry heat.
 */
export interface SubmitRatingResponse {
  matchId: string;
  userId: string;
  rating: number;
  matchAggregate: {
    ratingAverage: number;
    starRating: number;
    ratingsCount: number;
  };
  rivalry: {
    rivalryId: string;
    heatScore: number;
    heat: RivalryHeat;
  } | null;
}

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

  update: async (matchId: string, data: Partial<Omit<ScheduleMatchInput, 'status'>>): Promise<Match> => {
    return fetchWithAuth(`${API_BASE_URL}/matches/${matchId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (matchId: string): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/matches/${matchId}`, {
      method: 'DELETE',
    });
  },

  claimSlot: async (
    matchId: string,
    slotId: string,
    options?: { wrestlerChoice?: 'main' | 'alternate' },
  ): Promise<Match> => {
    return fetchWithAuth(`${API_BASE_URL}/matches/${matchId}/slots/${slotId}/claim`, {
      method: 'POST',
      // Body is optional — players with no alternate omit it; players with
      // both must include the choice (the chooser modal pre-supplies it).
      ...(options?.wrestlerChoice
        ? { body: JSON.stringify({ wrestlerChoice: options.wrestlerChoice }) }
        : {}),
    });
  },

  releaseSlot: async (matchId: string, slotId: string): Promise<Match> => {
    return fetchWithAuth(`${API_BASE_URL}/matches/${matchId}/slots/${slotId}/claim`, {
      method: 'DELETE',
    });
  },

  adminUpdateSlot: async (
    matchId: string,
    slotId: string,
    patch: {
      playerId?: string | null;
      lockedByAdmin?: boolean;
      teamLabel?: string | null;
      wrestlerChoice?: 'main' | 'alternate';
    },
  ): Promise<Match> => {
    return fetchWithAuth(`${API_BASE_URL}/matches/${matchId}/slots/${slotId}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  /**
   * Submit a 1–5 star rating for a completed match. On success returns
   * the updated match-level rating aggregate and, if the match belongs
   * to an active rivalry, the recomputed rivalry heat.
   *
   * The backend rejects duplicates with a 409 Conflict — callers should
   * surface the thrown Error's message ("You have already rated this
   * match.") to detect and handle that case.
   */
  submitRating: async (matchId: string, rating: number): Promise<SubmitRatingResponse> => {
    return fetchWithAuth(`${API_BASE_URL}/matches/${matchId}/ratings`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    });
  },

  /**
   * Admin/Moderator-only flag toggle for "Match of the Night". Returns
   * the updated Match. Wrestlers and Fantasy users receive a 403.
   */
  setMatchOfTheNight: async (matchId: string, matchOfTheNight: boolean): Promise<Match> => {
    return fetchWithAuth(`${API_BASE_URL}/matches/${matchId}/motn`, {
      method: 'PUT',
      body: JSON.stringify({ matchOfTheNight }),
    });
  },
};
