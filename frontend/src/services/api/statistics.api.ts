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

export interface RatedMatchSummary {
  matchId: string;
  date: string;
  starRating: number;
  matchOfTheNight: boolean;
  participants: string[];
  winners?: string[];
  losers?: string[];
}

export interface PlayerAverageRating {
  playerId: string;
  averageRating: number;
  matchCount: number;
}

export interface MatchRatingsResponse {
  highestRatedMatches: RatedMatchSummary[];
  playerAverageRatings: PlayerAverageRating[];
}

export interface MatchTypeStatsEntry {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  winPercentage: number;
  rank: number;
}

export interface MatchTypeLeaderboardsResponse {
  leaderboards: Record<string, MatchTypeStatsEntry[]>;
}

export interface PlayerMatchStatsByType {
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  winPercentage: number;
}

export interface PlayerMatchStatsResponse {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  overall: PlayerMatchStatsByType;
  byMatchType: Record<string, PlayerMatchStatsByType>;
  seasonId?: string;
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

  getMatchRatings: async (signal?: AbortSignal): Promise<MatchRatingsResponse> => {
    const params = new URLSearchParams({ section: 'match-ratings' });
    return fetchWithAuth(`${API_BASE_URL}/statistics?${params}`, {}, signal);
  },

  getMatchTypeLeaderboards: async (seasonId?: string, signal?: AbortSignal): Promise<MatchTypeLeaderboardsResponse> => {
    const params = new URLSearchParams({ section: 'match-types' });
    if (seasonId) params.set('seasonId', seasonId);
    return fetchWithAuth(`${API_BASE_URL}/statistics?${params}`, {}, signal);
  },

  getPlayerMatchStats: async (playerId: string, seasonId?: string, signal?: AbortSignal): Promise<PlayerMatchStatsResponse> => {
    const params = new URLSearchParams();
    if (seasonId) params.set('seasonId', seasonId);
    const qs = params.toString();
    return fetchWithAuth(`${API_BASE_URL}/players/${playerId}/statistics${qs ? `?${qs}` : ''}`, {}, signal);
  },
};
