import type {
  Stable,
  StableWithMembers,
  StableInvitationWithDetails,
  StableStanding,
  StableDetailResponse,
  CreateStableInput,
  InviteToStableInput,
} from '../../types/stable';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const factionsApi = {
  getAll: async (filters?: { status?: string }, signal?: AbortSignal): Promise<Stable[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    const query = params.toString();
    return fetchWithAuth(`${API_BASE_URL}/stables${query ? `?${query}` : ''}`, {}, signal);
  },

  getById: async (stableId: string, signal?: AbortSignal): Promise<StableDetailResponse> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}`, {}, signal);
  },

  getStandings: async (signal?: AbortSignal): Promise<StableStanding[]> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/standings`, {}, signal);
  },

  create: async (input: CreateStableInput): Promise<Stable> => {
    return fetchWithAuth(`${API_BASE_URL}/stables`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  update: async (stableId: string, data: Partial<CreateStableInput>): Promise<Stable> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  approve: async (stableId: string): Promise<Stable> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/approve`, {
      method: 'POST',
    });
  },

  reject: async (stableId: string): Promise<Stable> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/reject`, {
      method: 'POST',
    });
  },

  invite: async (stableId: string, input: InviteToStableInput): Promise<StableInvitationWithDetails> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  respondToInvitation: async (
    stableId: string,
    invitationId: string,
    action: 'accept' | 'decline',
  ): Promise<{ invitation: StableInvitationWithDetails; stable: StableWithMembers }> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/invitations/${invitationId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  },

  disband: async (stableId: string): Promise<Stable> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/disband`, {
      method: 'POST',
    });
  },

  reactivate: async (
    stableId: string,
  ): Promise<{
    message: string;
    stableId: string;
    status: 'active';
    restoredMemberIds: string[];
    skippedMembers: { playerId: string; reason: 'not-found' | 'in-other-stable' }[];
  }> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/reactivate`, {
      method: 'POST',
    });
  },

  removeMember: async (stableId: string, playerId: string): Promise<Stable> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/remove-member`, {
      method: 'POST',
      body: JSON.stringify({ playerId }),
    });
  },

  leave: async (stableId: string, playerId: string): Promise<Stable> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/remove-member`, {
      method: 'POST',
      body: JSON.stringify({ playerId }),
    });
  },

  delete: async (stableId: string): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/stables/${stableId}`, {
      method: 'DELETE',
    });
  },

  getInvitations: async (stableId: string, signal?: AbortSignal): Promise<StableInvitationWithDetails[]> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/invitations`, {}, signal);
  },
};
