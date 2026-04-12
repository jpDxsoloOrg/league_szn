import type {
  AcceptInvitationResponse,
  InvitationListResponse,
  JoinQueueResponse,
  MatchInvitation,
  MatchmakingPreferences,
  OnlinePlayer,
  PresenceEntry,
  QueueEntry,
} from '../../types/matchmaking';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const matchmakingApi = {
  heartbeat: async (): Promise<PresenceEntry> => {
    return fetchWithAuth(`${API_BASE_URL}/matchmaking/heartbeat`, {
      method: 'POST',
    });
  },

  leavePresence: async (): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/matchmaking/presence`, {
      method: 'DELETE',
    });
  },

  joinQueue: async (prefs: MatchmakingPreferences): Promise<JoinQueueResponse> => {
    return fetchWithAuth(`${API_BASE_URL}/matchmaking/queue/join`, {
      method: 'POST',
      body: JSON.stringify(prefs),
    });
  },

  leaveQueue: async (): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/matchmaking/queue/leave`, {
      method: 'POST',
    });
  },

  getQueue: async (): Promise<QueueEntry[]> => {
    return fetchWithAuth(`${API_BASE_URL}/matchmaking/queue`);
  },

  getOnline: async (): Promise<OnlinePlayer[]> => {
    return fetchWithAuth(`${API_BASE_URL}/matchmaking/online`);
  },

  createInvitation: async (
    targetPlayerId: string,
    prefs: MatchmakingPreferences
  ): Promise<MatchInvitation> => {
    return fetchWithAuth(`${API_BASE_URL}/matchmaking/invite`, {
      method: 'POST',
      body: JSON.stringify({ targetPlayerId, ...prefs }),
    });
  },

  getInvitations: async (): Promise<InvitationListResponse> => {
    return fetchWithAuth(`${API_BASE_URL}/matchmaking/invitations`);
  },

  acceptInvitation: async (invitationId: string): Promise<AcceptInvitationResponse> => {
    return fetchWithAuth(`${API_BASE_URL}/matchmaking/invitations/${invitationId}/accept`, {
      method: 'POST',
    });
  },

  declineInvitation: async (invitationId: string): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/matchmaking/invitations/${invitationId}/decline`, {
      method: 'POST',
    });
  },
};
