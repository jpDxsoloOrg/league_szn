// Shared utilities
export { API_BASE_URL, AUTH_EXPIRED_EVENT, SIGNUP_BLOCKED_EVENT, ApiError, getAuthToken, fetchWithAuth, isApiError } from './apiClient';

// API modules
export { playersApi, disciplineApi } from './players.api';
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
export { usersApi, BULK_USERS_MAX } from './users.api';
export type { BulkUserAction, BulkUserRole, BulkUserResult } from './users.api';
export { siteConfigApi } from './siteConfig.api';
export { economyApi } from './economy.api';
// ECO-12
export { contractsApi } from './contracts.api';

// ECO-14
export { shopApi, gmInterferenceApi } from './shop.api';
export { finesApi, noShowsApi } from './fines.api';

export { authApi } from './auth.api';
export { profileApi } from './profile.api';
export { statisticsApi } from './statistics.api';
export { rivalriesApi } from './rivalries.api';
export { imagesApi } from './images.api';
export { challengesApi } from './challenges.api';
export { promosApi } from './promos.api';
export { activityApi } from './activity.api';
export { seasonAwardsApi } from './seasonAwards.api';
export { companiesApi } from './companies.api';
export { showsApi } from './shows.api';
export { factionsApi } from './factions.api';
export { tagTeamsApi } from './tagTeams.api';
export { wrestlersApi } from './wrestlers.api';
export { videosApi } from './videos.api';
export { announcementsApi } from './announcements.api';
export { tickerMessagesApi, TICKER_TEXT_MAX_LENGTH } from './tickerMessages.api';
export { tickerApi } from './ticker.api';
export { notificationsApi } from './notifications.api';
export { overallsApi } from './overalls.api';
export { transfersApi } from './transfers.api';
export { storylineRequestsApi } from './storylineRequests.api';
export { locationsApi } from './locations.api';
export { progressionApi, executeProgressionError, SEASON_REVIEW_BATCH_MAX } from './progression.api';

// Type/interface re-exports
export type { SiteFeatures, SiteConfigResponse, TickerSettings, TickerSegmentKey, TickerScrollSpeed } from './siteConfig.api';
export { TICKER_SEGMENT_KEYS, TICKER_SCROLL_SPEEDS } from './siteConfig.api';
export type { PlayerDirectoryEntry } from './players.api';
export type {
  StatsPlayer,
  PlayerStatsResponse,
  HeadToHeadResponse,
  LeaderboardsResponse,
  RecordsResponse,
  AchievementsResponse,
  RatedMatchSummary,
  MatchRatingsResponse,
  MatchTypeStatsEntry,
  MatchTypeLeaderboardsResponse,
  PlayerMatchStatsByType,
  PlayerMatchStatsResponse,
} from './statistics.api';
export type { SeasonAwardsResponse } from './seasonAwards.api';
export type { CreateVideoInput } from './videos.api';
export type { CreateAnnouncementInput } from './announcements.api';
export type { CreateTickerMessageInput, UpdateTickerMessageInput } from './tickerMessages.api';
export type { TickerFeed, TickerFeedItem, TickerFeedSegment } from './ticker.api';
export type { NotificationsListResponse, UnreadCountResponse } from './notifications.api';
