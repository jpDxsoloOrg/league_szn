import type { ChallengeWithPlayers, CreateChallengeInput } from '../../types/challenge';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const challengesApi = {
  getAll: async (filters?: { status?: string; playerId?: string }, signal?: AbortSignal): Promise<ChallengeWithPlayers[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.playerId) params.set('playerId', filters.playerId);
    const query = params.toString();
    return fetchWithAuth(`${API_BASE_URL}/challenges${query ? `?${query}` : ''}`, {}, signal);
  },

  getById: async (challengeId: string, signal?: AbortSignal): Promise<ChallengeWithPlayers> => {
    return fetchWithAuth(`${API_BASE_URL}/challenges/${challengeId}`, {}, signal);
  },

  create: async (input: CreateChallengeInput): Promise<ChallengeWithPlayers> => {
    return fetchWithAuth(`${API_BASE_URL}/challenges`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  respond: async (challengeId: string, action: 'accept' | 'decline' | 'counter', data?: {
    responseMessage?: string;
    counterMatchType?: string;
    counterStipulation?: string;
    counterMessage?: string;
  }): Promise<ChallengeWithPlayers> => {
    return fetchWithAuth(`${API_BASE_URL}/challenges/${challengeId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action, ...data }),
    });
  },

  respondV2: async (
    challengeId: string,
    response: 'accepted' | 'declined',
    declineReason?: string,
  ): Promise<ChallengeWithPlayers & { matchId?: string; scheduledEventId?: string; matchDate?: string; eventName?: string }> => {
    return fetchWithAuth(`${API_BASE_URL}/challenges/${challengeId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ response, declineReason }),
    });
  },

  cancel: async (challengeId: string): Promise<ChallengeWithPlayers> => {
    return fetchWithAuth(`${API_BASE_URL}/challenges/${challengeId}/cancel`, {
      method: 'POST',
    });
  },

  delete: async (challengeId: string): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/challenges/${challengeId}`, {
      method: 'DELETE',
    });
  },

  bulkDelete: async (body: { statuses: string[] }): Promise<{ deleted: number; message: string }> => {
    return fetchWithAuth(`${API_BASE_URL}/challenges/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};
