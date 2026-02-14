import type {
  PlayerStatistics,
  HeadToHead,
  ChampionshipStats,
  Achievement,
  LeaderboardEntry,
  RecordEntry,
} from '../../types/statistics';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export interface StatsPlayer {
  playerId: string;
  name: string;
  wrestlerName: string;
}

export interface PlayerStatsResponse {
  players: StatsPlayer[];
  statistics?: PlayerStatistics[];
  championshipStats?: (ChampionshipStats & { championshipName?: string })[];
  achievements?: Achievement[];
}

export interface HeadToHeadResponse {
  players: StatsPlayer[];
  headToHead: HeadToHead | null;
  player1Stats: PlayerStatistics;
  player2Stats: PlayerStatistics;
}

export interface LeaderboardsResponse {
  players: StatsPlayer[];
  leaderboards: Record<string, LeaderboardEntry[]>;
}

export interface RecordsResponse {
  records: Record<string, RecordEntry[]>;
  activeThreats: {
    recordName: string;
    currentHolder: string;
    currentValue: number | string;
    threatPlayer: string;
    threatValue: number | string;
    gapDescription: string;
  }[];
}

export interface AchievementsResponse {
  players: StatsPlayer[];
  allAchievements: Omit<Achievement, 'playerId' | 'earnedAt'>[];
  achievements?: Achievement[];
}

export const statisticsApi = {
  getPlayerStats: async (playerId?: string, seasonId?: string, signal?: AbortSignal): Promise<PlayerStatsResponse> => {
    const params = new URLSearchParams({ section: 'player-stats' });
    if (playerId) params.set('playerId', playerId);
    if (seasonId) params.set('seasonId', seasonId);
    return fetchWithAuth(`${API_BASE_URL}/statistics?${params}`, {}, signal);
  },

  getHeadToHead: async (player1Id: string, player2Id: string, seasonId?: string, signal?: AbortSignal): Promise<HeadToHeadResponse> => {
    const params = new URLSearchParams({ section: 'head-to-head', player1Id, player2Id });
    if (seasonId) params.set('seasonId', seasonId);
    return fetchWithAuth(`${API_BASE_URL}/statistics?${params}`, {}, signal);
  },

  getHeadToHeadPlayers: async (signal?: AbortSignal): Promise<{ players: StatsPlayer[] }> => {
    const params = new URLSearchParams({ section: 'head-to-head' });
    return fetchWithAuth(`${API_BASE_URL}/statistics?${params}`, {}, signal);
  },

  getLeaderboards: async (seasonId?: string, signal?: AbortSignal): Promise<LeaderboardsResponse> => {
    const params = new URLSearchParams({ section: 'leaderboards' });
    if (seasonId) params.set('seasonId', seasonId);
    return fetchWithAuth(`${API_BASE_URL}/statistics?${params}`, {}, signal);
  },

  getRecords: async (signal?: AbortSignal): Promise<RecordsResponse> => {
    const params = new URLSearchParams({ section: 'records' });
    return fetchWithAuth(`${API_BASE_URL}/statistics?${params}`, {}, signal);
  },

  getAchievements: async (playerId?: string, signal?: AbortSignal): Promise<AchievementsResponse> => {
    const params = new URLSearchParams({ section: 'achievements' });
    if (playerId) params.set('playerId', playerId);
    return fetchWithAuth(`${API_BASE_URL}/statistics?${params}`, {}, signal);
  },
};
