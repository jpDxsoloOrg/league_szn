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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// Helper to get auth token from session storage
const getAuthToken = (): string | null => {
  return sessionStorage.getItem('authToken');
};

// Helper to make authenticated requests
const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
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
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
};

// Players API
export const playersApi = {
  getAll: async (): Promise<Player[]> => {
    return fetchWithAuth(`${API_BASE_URL}/players`);
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
  getAll: async (filters?: { status?: string }): Promise<Match[]> => {
    const params = new URLSearchParams(filters as Record<string, string>);
    return fetchWithAuth(`${API_BASE_URL}/matches?${params}`);
  },

  schedule: async (match: Omit<Match, 'matchId' | 'createdAt'>): Promise<Match> => {
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
  getAll: async (): Promise<Championship[]> => {
    return fetchWithAuth(`${API_BASE_URL}/championships`);
  },

  create: async (championship: Omit<Championship, 'championshipId' | 'createdAt'>): Promise<Championship> => {
    return fetchWithAuth(`${API_BASE_URL}/championships`, {
      method: 'POST',
      body: JSON.stringify(championship),
    });
  },

  getHistory: async (championshipId: string): Promise<ChampionshipReign[]> => {
    return fetchWithAuth(`${API_BASE_URL}/championships/${championshipId}/history`);
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
  getAll: async (): Promise<Tournament[]> => {
    return fetchWithAuth(`${API_BASE_URL}/tournaments`);
  },

  getById: async (tournamentId: string): Promise<Tournament> => {
    return fetchWithAuth(`${API_BASE_URL}/tournaments/${tournamentId}`);
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
  get: async (seasonId?: string): Promise<Standings> => {
    const params = seasonId ? `?seasonId=${seasonId}` : '';
    return fetchWithAuth(`${API_BASE_URL}/standings${params}`);
  },
};

// Seasons API
export const seasonsApi = {
  getAll: async (): Promise<Season[]> => {
    return fetchWithAuth(`${API_BASE_URL}/seasons`);
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
  getAll: async (): Promise<Division[]> => {
    return fetchWithAuth(`${API_BASE_URL}/divisions`);
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

// Auth API
export const authApi = {
  login: async (username: string, password: string): Promise<{ token: string; expiresIn: string }> => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Login failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    // Store the token after successful login
    sessionStorage.setItem('authToken', data.token);
    return data;
  },

  setToken: (token: string) => {
    sessionStorage.setItem('authToken', token);
  },

  clearToken: () => {
    sessionStorage.removeItem('authToken');
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
