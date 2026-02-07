import type {
  Player,
  Match,
  Championship,
  ChampionshipReign,
  Tournament,
  Standings,
  Season,
  Division
} from '../types';
import type { LeagueEvent, EventWithMatches, CreateEventInput, UpdateEventInput } from '../types/event';
import type { ChampionshipContenders } from '../types/contender';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// Helper to get auth token from session storage (uses Cognito access token)
const getAuthToken = (): string | null => {
  return sessionStorage.getItem('accessToken');
};

// Helper to make authenticated requests with optional abort signal
const fetchWithAuth = async (url: string, options: RequestInit = {}, signal?: AbortSignal) => {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  // Handle 204 No Content responses (e.g., from DELETE operations)
  if (response.status === 204) {
    return undefined;
  }

  return response.json();
};

// Players API
export const playersApi = {
  getAll: async (signal?: AbortSignal): Promise<Player[]> => {
    return fetchWithAuth(`${API_BASE_URL}/players`, {}, signal);
  },

  create: async (player: Omit<Player, 'playerId' | 'createdAt' | 'updatedAt'>): Promise<Player> => {
    return fetchWithAuth(`${API_BASE_URL}/players`, {
      method: 'POST',
      body: JSON.stringify(player),
    });
  },

  update: async (playerId: string, updates: Partial<Player>): Promise<Player> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${playerId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (playerId: string): Promise<void> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${playerId}`, {
      method: 'DELETE',
    });
  },
};

// Matches API
export const matchesApi = {
  getAll: async (filters?: { status?: string }, signal?: AbortSignal): Promise<Match[]> => {
    const params = new URLSearchParams(filters as Record<string, string>);
    return fetchWithAuth(`${API_BASE_URL}/matches?${params}`, {}, signal);
  },

  schedule: async (match: Omit<Match, 'matchId' | 'createdAt'> & { eventId?: string; designation?: string }): Promise<Match> => {
    return fetchWithAuth(`${API_BASE_URL}/matches`, {
      method: 'POST',
      body: JSON.stringify(match),
    });
  },

  recordResult: async (matchId: string, result: { winners: string[], losers: string[], winningTeam?: number }): Promise<Match> => {
    return fetchWithAuth(`${API_BASE_URL}/matches/${matchId}/result`, {
      method: 'PUT',
      body: JSON.stringify(result),
    });
  },
};

// Championships API
export const championshipsApi = {
  getAll: async (signal?: AbortSignal): Promise<Championship[]> => {
    return fetchWithAuth(`${API_BASE_URL}/championships`, {}, signal);
  },

  create: async (championship: Omit<Championship, 'championshipId' | 'createdAt'>): Promise<Championship> => {
    return fetchWithAuth(`${API_BASE_URL}/championships`, {
      method: 'POST',
      body: JSON.stringify(championship),
    });
  },

  getHistory: async (championshipId: string, signal?: AbortSignal): Promise<ChampionshipReign[]> => {
    return fetchWithAuth(`${API_BASE_URL}/championships/${championshipId}/history`, {}, signal);
  },

  update: async (championshipId: string, updates: Partial<Championship>): Promise<Championship> => {
    return fetchWithAuth(`${API_BASE_URL}/championships/${championshipId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (championshipId: string): Promise<void> => {
    return fetchWithAuth(`${API_BASE_URL}/championships/${championshipId}`, {
      method: 'DELETE',
    });
  },
};

// Tournaments API
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

// Standings API
export const standingsApi = {
  get: async (seasonId?: string, signal?: AbortSignal): Promise<Standings> => {
    const params = seasonId ? `?seasonId=${seasonId}` : '';
    return fetchWithAuth(`${API_BASE_URL}/standings${params}`, {}, signal);
  },
};

// Seasons API
export const seasonsApi = {
  getAll: async (signal?: AbortSignal): Promise<Season[]> => {
    return fetchWithAuth(`${API_BASE_URL}/seasons`, {}, signal);
  },

  create: async (season: { name: string; startDate: string; endDate?: string }): Promise<Season> => {
    return fetchWithAuth(`${API_BASE_URL}/seasons`, {
      method: 'POST',
      body: JSON.stringify(season),
    });
  },

  update: async (seasonId: string, updates: Partial<Season>): Promise<Season> => {
    return fetchWithAuth(`${API_BASE_URL}/seasons/${seasonId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (seasonId: string): Promise<void> => {
    return fetchWithAuth(`${API_BASE_URL}/seasons/${seasonId}`, {
      method: 'DELETE',
    });
  },
};

// Divisions API
export const divisionsApi = {
  getAll: async (signal?: AbortSignal): Promise<Division[]> => {
    return fetchWithAuth(`${API_BASE_URL}/divisions`, {}, signal);
  },

  create: async (division: { name: string; description?: string }): Promise<Division> => {
    return fetchWithAuth(`${API_BASE_URL}/divisions`, {
      method: 'POST',
      body: JSON.stringify(division),
    });
  },

  update: async (divisionId: string, updates: Partial<Division>): Promise<Division> => {
    return fetchWithAuth(`${API_BASE_URL}/divisions/${divisionId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (divisionId: string): Promise<void> => {
    return fetchWithAuth(`${API_BASE_URL}/divisions/${divisionId}`, {
      method: 'DELETE',
    });
  },
};

// Events API
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

// Contenders API
export const contendersApi = {
  getForChampionship: async (championshipId: string, signal?: AbortSignal): Promise<ChampionshipContenders> => {
    return fetchWithAuth(`${API_BASE_URL}/championships/${championshipId}/contenders`, {}, signal);
  },

  recalculate: async (championshipId?: string): Promise<{ message: string; summary: Record<string, number> }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/contenders/recalculate`, {
      method: 'POST',
      body: JSON.stringify(championshipId ? { championshipId } : {}),
    });
  },
};

// Admin API
export const adminApi = {
  clearAll: async (): Promise<{ message: string; deletedCounts: Record<string, number> }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/clear-all`, {
      method: 'DELETE',
    });
  },

  seedData: async (): Promise<{ message: string; createdCounts: Record<string, number> }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/seed-data`, {
      method: 'POST',
    });
  },
};

// User Management API (Admin only)
export const usersApi = {
  list: async (signal?: AbortSignal): Promise<{
    users: Array<{
      username: string;
      email: string;
      name: string;
      wrestlerName: string;
      status: string;
      enabled: boolean;
      created: string;
      groups: string[];
    }>;
  }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/users`, {}, signal);
  },

  updateRole: async (username: string, role: string, action: 'promote' | 'demote'): Promise<{
    message: string;
    username: string;
    groups: string[];
  }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/users/role`, {
      method: 'POST',
      body: JSON.stringify({ username, role, action }),
    });
  },
};

// Auth API (uses Cognito via cognito.ts service)
export const authApi = {
  setToken: (token: string) => {
    sessionStorage.setItem('accessToken', token);
  },

  clearToken: () => {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('idToken');
  },

  isAuthenticated: (): boolean => {
    return !!getAuthToken();
  },

  getToken: (): string | null => {
    return getAuthToken();
  },
};

// Images API
export const imagesApi = {
  generateUploadUrl: async (
    fileName: string,
    fileType: string,
    folder: 'wrestlers' | 'championships'
  ): Promise<{ uploadUrl: string; imageUrl: string; fileKey: string }> => {
    return fetchWithAuth(`${API_BASE_URL}/images/upload-url`, {
      method: 'POST',
      body: JSON.stringify({ fileName, fileType, folder }),
    });
  },

  uploadToS3: async (uploadUrl: string, file: File): Promise<void> => {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to upload image');
    }
  },
};
