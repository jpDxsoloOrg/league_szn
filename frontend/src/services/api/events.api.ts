import type {
  LeagueEvent,
  EventWithMatches,
  CreateEventInput,
  UpdateEventInput,
  EventCheckIn,
  EventCheckInStatus,
  EventCheckInSummary,
  EventCheckInRoster,
  EventCommentary,
} from '../../types/event';
import { API_BASE_URL, fetchWithAuth, isApiError } from './apiClient';

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

  getCommentary: async (eventId: string, signal?: AbortSignal): Promise<EventCommentary> => {
    return fetchWithAuth(`${API_BASE_URL}/events/${eventId}/commentary`, {}, signal);
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

  checkIn: async (eventId: string, status: EventCheckInStatus): Promise<EventCheckIn> => {
    return fetchWithAuth(`${API_BASE_URL}/events/${eventId}/check-in`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  getMyCheckIn: async (eventId: string, signal?: AbortSignal): Promise<EventCheckIn | null> => {
    try {
      const checkIn: EventCheckIn | undefined = await fetchWithAuth(`${API_BASE_URL}/events/${eventId}/check-in/me`, {}, signal);
      return checkIn ?? null;
    } catch (err) {
      if (isApiError(err, 404)) return null;
      throw err;
    }
  },

  deleteCheckIn: async (eventId: string): Promise<void> => {
    return fetchWithAuth(`${API_BASE_URL}/events/${eventId}/check-in`, {
      method: 'DELETE',
    });
  },

  getCheckInSummary: async (eventId: string, signal?: AbortSignal): Promise<EventCheckInSummary> => {
    return fetchWithAuth(`${API_BASE_URL}/events/${eventId}/check-ins/summary`, {}, signal);
  },

  getCheckIns: async (eventId: string, signal?: AbortSignal): Promise<EventCheckInRoster> => {
    return fetchWithAuth(`${API_BASE_URL}/events/${eventId}/check-ins`, {}, signal);
  },
};
