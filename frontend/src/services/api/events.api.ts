import type { LeagueEvent, EventWithMatches, CreateEventInput, UpdateEventInput } from '../../types/event';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const eventsApi = {
  getAll: async (filters?: { eventType?: string; status?: string; seasonId?: string }, signal?: AbortSignal): Promise<LeagueEvent[]> => {
    const params = new URLSearchParams();
    if (filters?.eventType) params.set('eventType', filters.eventType);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.seasonId) params.set('seasonId', filters.seasonId);
    const query = params.toString();
    return fetchWithAuth(`${API_BASE_URL}/events${query ? `?${query}` : ''}`, {}, signal);
  },

  getById: async (eventId: string, signal?: AbortSignal): Promise<EventWithMatches> => {
    return fetchWithAuth(`${API_BASE_URL}/events/${eventId}`, {}, signal);
  },

  create: async (event: CreateEventInput): Promise<LeagueEvent> => {
    return fetchWithAuth(`${API_BASE_URL}/events`, {
      method: 'POST',
      body: JSON.stringify(event),
    });
  },

  update: async (eventId: string, updates: Partial<UpdateEventInput>): Promise<LeagueEvent> => {
    return fetchWithAuth(`${API_BASE_URL}/events/${eventId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (eventId: string): Promise<void> => {
    return fetchWithAuth(`${API_BASE_URL}/events/${eventId}`, {
      method: 'DELETE',
    });
  },
};
