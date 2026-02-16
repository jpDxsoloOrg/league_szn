import { API_BASE_URL, fetchWithAuth } from './apiClient';

export interface RivalryPlayer {
  playerId: string;
  name: string;
  wrestlerName: string;
  imageUrl?: string;
}

export interface RivalryMatch {
  matchId: string;
  date: string;
  championshipId?: string;
}

export interface Rivalry {
  playerIds: [string, string];
  playerA: RivalryPlayer;
  playerB: RivalryPlayer;
  winsA: number;
  winsB: number;
  recentMatches: RivalryMatch[];
  intensity: 'heating-up' | 'intense' | 'historic';
  championshipAtStake?: boolean;
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
