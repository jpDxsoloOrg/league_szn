// Shared utilities
export { API_BASE_URL, getAuthToken, fetchWithAuth } from './apiClient';

// API modules
export { playersApi } from './players.api';
export { matchesApi } from './matches.api';
export { championshipsApi } from './championships.api';
export { tournamentsApi } from './tournaments.api';
export { standingsApi } from './standings.api';
export { dashboardApi } from './dashboard.api';
export { seasonsApi } from './seasons.api';
export { divisionsApi } from './divisions.api';
export { stipulationsApi } from './stipulations.api';
export { matchTypesApi } from './matchTypes.api';
export { eventsApi } from './events.api';
export { contendersApi } from './contenders.api';
export { adminApi } from './admin.api';
export { fantasyApi } from './fantasy.api';
export { usersApi } from './users.api';
export { siteConfigApi } from './siteConfig.api';
export { authApi } from './auth.api';
export { profileApi } from './profile.api';
export { statisticsApi } from './statistics.api';
export { rivalriesApi } from './rivalries.api';
export { imagesApi } from './images.api';
export { challengesApi } from './challenges.api';
export { promosApi } from './promos.api';
export { activityApi } from './activity.api';

// Type/interface re-exports
export type { SiteFeatures } from './siteConfig.api';
export type {
  StatsPlayer,
  PlayerStatsResponse,
  HeadToHeadResponse,
  LeaderboardsResponse,
  RecordsResponse,
  AchievementsResponse,
  RatedMatchSummary,
  MatchRatingsResponse,
} from './statistics.api';
