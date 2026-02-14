import type { Tournament } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const tournamentsApi = {
  getAll: async (signal?: AbortSignal): Promise<Tournament[]> => {
    return fetchWithAuth(`${API_BASE_URL}/tournaments`, {}, signal);
  },

  getById: async (tournamentId: string, signal?: AbortSignal): Promise<Tournament> => {
    return fetchWithAuth(`${API_BASE_URL}/tournaments/${tournamentId}`, {}, signal);
  },

  create: async (tournament: Omit<Tournament, 'tournamentId' | 'createdAt'>): Promise<Tournament> => {
    return fetchWithAuth(`${API_BASE_URL}/tournaments`, {
      method: 'POST',
      body: JSON.stringify(tournament),
    });
  },

  update: async (tournamentId: string, updates: Partial<Tournament>): Promise<Tournament> => {
    return fetchWithAuth(`${API_BASE_URL}/tournaments/${tournamentId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },
};
