import type {
  TagTeam,
  TagTeamDetailResponse,
  TagTeamStanding,
  CreateTagTeamInput,
} from '../../types/tagTeam';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const tagTeamsApi = {
  getAll: async (filters?: { status?: string }, signal?: AbortSignal): Promise<TagTeam[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    const query = params.toString();
    return fetchWithAuth(`${API_BASE_URL}/tag-teams${query ? `?${query}` : ''}`, {}, signal);
  },

  getById: async (tagTeamId: string, signal?: AbortSignal): Promise<TagTeamDetailResponse> => {
    return fetchWithAuth(`${API_BASE_URL}/tag-teams/${tagTeamId}`, {}, signal);
  },

  getStandings: async (signal?: AbortSignal): Promise<TagTeamStanding[]> => {
    return fetchWithAuth(`${API_BASE_URL}/tag-teams/standings`, {}, signal);
  },

  create: async (input: CreateTagTeamInput): Promise<TagTeam> => {
    return fetchWithAuth(`${API_BASE_URL}/tag-teams`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  update: async (tagTeamId: string, data: Partial<{ name: string; imageUrl: string }>): Promise<TagTeam> => {
    return fetchWithAuth(`${API_BASE_URL}/tag-teams/${tagTeamId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  respond: async (tagTeamId: string, action: 'accept' | 'decline'): Promise<TagTeam> => {
    return fetchWithAuth(`${API_BASE_URL}/tag-teams/${tagTeamId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  },

  approve: async (tagTeamId: string): Promise<TagTeam> => {
    return fetchWithAuth(`${API_BASE_URL}/tag-teams/${tagTeamId}/approve`, {
      method: 'POST',
    });
  },

  reject: async (tagTeamId: string): Promise<TagTeam> => {
    return fetchWithAuth(`${API_BASE_URL}/tag-teams/${tagTeamId}/reject`, {
      method: 'POST',
    });
  },

  dissolve: async (tagTeamId: string): Promise<TagTeam> => {
    return fetchWithAuth(`${API_BASE_URL}/tag-teams/${tagTeamId}/dissolve`, {
      method: 'POST',
    });
  },

  delete: async (tagTeamId: string): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/tag-teams/${tagTeamId}`, {
      method: 'DELETE',
    });
  },
};
