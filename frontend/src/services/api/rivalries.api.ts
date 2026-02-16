import { API_BASE_URL, fetchWithAuth } from './apiClient';

export interface RivalryPlayer {
  playerId: string;
  name: string;
  wrestlerName: string;
  imageUrl?: string;
}

export interface Rivalry {
  player1Id: string;
  player2Id: string;
  player1?: RivalryPlayer;
  player2?: RivalryPlayer;
  player1Wins: number;
  player2Wins: number;
  draws: number;
  matchCount: number;
  lastMatchDate: string;
  championshipMatches: number;
  recentMatchIds: string[];
  intensityBadge: 'heatingUp' | 'intense' | 'historic';
}

export interface RivalriesResponse {
  rivalries: Rivalry[];
}

export const rivalriesApi = {
  getRivalries: async (seasonId?: string, signal?: AbortSignal): Promise<RivalriesResponse> => {
    const params = new URLSearchParams();
    if (seasonId) params.set('seasonId', seasonId);
    const query = params.toString();
    return fetchWithAuth(
      `${API_BASE_URL}/rivalries${query ? `?${query}` : ''}`,
      {},
      signal
    );
  },
};
