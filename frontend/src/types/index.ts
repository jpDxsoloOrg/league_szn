export interface Player {
  playerId: string;
  userId?: string;
  name: string;
  currentWrestler: string;
  alternateWrestler?: string;
  wins: number;
  losses: number;
  draws: number;
  imageUrl?: string;
  psnId?: string;
  divisionId?: string;
  stableId?: string;
  tagTeamId?: string;
  alignment?: 'face' | 'heel' | 'neutral';
  mainOverall?: number;
  createdAt: string;
  updatedAt: string;
  /** Last 5 match results (newest first): W win, L loss, D draw */
  recentForm?: ('W' | 'L' | 'D')[];
  /** Current consecutive result streak from most recent match */
  currentStreak?: { type: 'W' | 'L' | 'D'; count: number };
}

export interface Match {
  matchId: string;
  date: string;
  matchFormat: string; // "singles", "tag", "triple-threat", etc.
  stipulationId?: string; // References Stipulations table
  participants: string[]; // playerIds
  teams?: string[][]; // Array of teams, each team is an array of playerIds (for tag team matches)
  winners?: string[]; // playerIds
  losers?: string[]; // playerIds
  isDraw?: boolean;
  winningTeam?: number; // Index of winning team (for tag team matches)
  isChampionship: boolean;
  isTitleDefense?: boolean;
  championshipId?: string;
  tournamentId?: string;
  seasonId?: string;
  status: 'scheduled' | 'completed';
  createdAt: string;
  challengeId?: string;
  promoId?: string;
  starRating?: number;
  matchOfTheNight?: boolean;
}

// Input type for scheduling a new match (uses new field names, backend handles legacy fields)
export interface ScheduleMatchInput {
  date?: string;
  matchFormat: string;
  stipulationId?: string;
  participants: string[];
  teams?: string[][];
  isChampionship: boolean;
  championshipId?: string;
  tournamentId?: string;
  seasonId?: string;
  eventId?: string;
  designation?: string;
  status: 'scheduled';
  challengeId?: string;
  promoId?: string;
}

export interface Championship {
  championshipId: string;
  name: string;
  type: 'singles' | 'tag';
  currentChampion?: string | string[]; // playerId or array for tag teams
  divisionId?: string;
  imageUrl?: string;
  createdAt: string;
  isActive: boolean;
}

export interface ChampionshipReign {
  championshipId: string;
  champion: string | string[];
  wonDate: string;
  lostDate?: string;
  matchId: string;
  daysHeld?: number;
  defenses?: number;
}

export interface Tournament {
  tournamentId: string;
  name: string;
  type: 'single-elimination' | 'round-robin';
  status: 'upcoming' | 'in-progress' | 'completed';
  participants: string[]; // playerIds
  brackets?: TournamentBracket; // for single-elimination
  standings?: Record<string, Omit<RoundRobinStanding, 'playerId'>>; // for round-robin
  winner?: string;
  createdAt: string;
}

export interface TournamentBracket {
  rounds: BracketRound[];
}

export interface BracketRound {
  roundNumber: number;
  matches: BracketMatch[];
}

export interface BracketMatch {
  matchId?: string;
  participant1?: string;
  participant2?: string;
  winner?: string;
}

export interface RoundRobinStanding {
  playerId: string;
  wins: number;
  losses: number;
  draws: number;
  points: number; // 2 for win, 1 for draw
}

export interface Standings {
  players: Player[];
  seasonId?: string;
  sortedByWins: boolean;
}

/** Dashboard API response types */
export interface DashboardChampion {
  championshipId: string;
  championshipName: string;
  championName: string;
  championImageUrl?: string;
  playerId: string;
  wonDate?: string;
  defenses?: number;
}

export interface DashboardEvent {
  eventId: string;
  name: string;
  date: string;
  eventType: string;
  venue?: string;
  matchCount?: number;
}

export interface DashboardMatch {
  matchId: string;
  date: string;
  matchType: string;
  stipulation?: string;
  isChampionship?: boolean;
  championshipName?: string;
  championshipImageUrl?: string;
  starRating?: number;
  matchOfTheNight?: boolean;
  winnerName: string;
  winnerImageUrl?: string;
  loserName: string;
  loserImageUrl?: string;
  eventId?: string;
}

export interface DashboardSeason {
  seasonId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  status: string;
  matchesPlayed?: number;
}

export interface DashboardQuickStats {
  totalPlayers: number;
  totalMatches: number;
  activeChampionships: number;
  mostWinsPlayer?: { name: string; wins: number };
}

export interface DashboardData {
  currentChampions: DashboardChampion[];
  upcomingEvents: DashboardEvent[];
  inProgressEvents: DashboardEvent[];
  recentResults: DashboardMatch[];
  seasonInfo: DashboardSeason | null;
  quickStats: DashboardQuickStats;
  activeChallengesCount: number;
}

export interface Season {
  seasonId: string;
  name: string;
  startDate: string;
  endDate?: string;
  status: 'active' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface Division {
  divisionId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  companyId: string;
  name: string;
  abbreviation?: string;
  imageUrl?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface Show {
  showId: string;
  name: string;
  companyId: string;
  description?: string;
  schedule?: 'weekly' | 'ppv' | 'special';
  dayOfWeek?: DayOfWeek;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Stipulation {
  stipulationId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatchType {
  matchTypeId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export type SeasonAwardType = 'mvp' | 'longest_win_streak' | 'iron_man' | 'best_win_pct' | 'most_title_defenses' | 'custom';

export interface SeasonAward {
  awardId: string;
  seasonId: string;
  name: string;
  awardType: SeasonAwardType;
  playerId: string;
  playerName?: string;
  description?: string;
  value?: string;
  createdAt: string;
}

export interface MatchFilters {
  status?: string;
  playerId?: string;
  matchType?: string;
  stipulationId?: string;
  championshipId?: string;
  seasonId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Activity feed item from GET /activity */
export type ActivityItemType =
  | 'match_result'
  | 'championship_change'
  | 'season_event'
  | 'tournament_result'
  | 'challenge_event'
  | 'promo_posted';

export interface ActivityItem {
  id: string;
  type: ActivityItemType;
  timestamp: string;
  summary: string;
  metadata: Record<string, unknown>;
}

export interface ActivityFeedResponse {
  items: ActivityItem[];
  nextCursor: string | null;
}

export interface Announcement {
  announcementId: string;
  title: string;
  body: string;          // HTML content
  createdBy: string;
  isActive: boolean;
  priority: number;      // 1=low, 2=medium, 3=high
  expiresAt?: string;
  videoUrl?: string;     // Optional attached video URL
  createdAt: string;
  updatedAt: string;
}

export type VideoCategory = 'match' | 'highlight' | 'promo' | 'other';

export interface Video {
  videoId: string;
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl?: string;
  category: VideoCategory;
  tags: string[];
  isPublished: boolean;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType = 'promo_mention' | 'challenge_received' | 'match_scheduled' | 'announcement' | 'stable_invitation' | 'tag_team_invitation' | 'transfer_reviewed';

export interface AppNotification {
  notificationId: string;
  userId: string;
  type: NotificationType;
  message: string;
  sourceId: string;
  sourceType: 'promo' | 'challenge' | 'match' | 'announcement' | 'stable' | 'tag_team' | 'transfer';
  isRead: boolean;
  createdAt: string;
}

export interface WrestlerOverall {
  playerId: string;
  mainOverall: number;
  alternateOverall?: number;
  submittedAt: string;
  updatedAt: string;
}

export interface WrestlerOverallWithPlayer extends WrestlerOverall {
  playerName: string;
  wrestlerName: string;
}

export type TransferRequestStatus = 'pending' | 'approved' | 'rejected';

export interface TransferRequest {
  requestId: string;
  playerId: string;
  fromDivisionId: string;
  toDivisionId: string;
  reason: string;
  status: TransferRequestStatus;
  createdAt: string;
  updatedAt: string;
  reviewedBy?: string;
  reviewNote?: string;
}

export interface TransferRequestWithDetails extends TransferRequest {
  playerName: string;
  fromDivisionName: string;
  toDivisionName: string;
}

export type StorylineRequestType = 'storyline' | 'backstage_attack' | 'rivalry';
export type StorylineRequestStatus = 'pending' | 'acknowledged' | 'declined';

export interface StorylineRequest {
  requestId: string;
  requesterId: string;
  targetPlayerIds: string[];
  requestType: StorylineRequestType;
  description: string;
  status: StorylineRequestStatus;
  gmNote?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MyStorylineRequest extends StorylineRequest {
  targetPlayerNames: string[];
}

export interface StorylineRequestWithDetails extends StorylineRequest {
  requesterName: string;
  targetPlayerNames: string[];
}
