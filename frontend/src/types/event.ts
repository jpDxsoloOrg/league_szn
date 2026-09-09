import type { MatchStatus, HydratedMatchSlot, WrestlerMove } from './index';

export type EventType = 'ppv' | 'weekly' | 'special' | 'house';

export type EventStatus = 'upcoming' | 'in-progress' | 'completed' | 'cancelled';

export type MatchDesignation = 'pre-show' | 'opener' | 'midcard' | 'co-main' | 'main-event';

export interface MatchCardEntry {
  position: number;
  matchId: string;
  designation: MatchDesignation;
  notes?: string;
}

export interface LeagueEvent {
  eventId: string;
  name: string;
  eventType: EventType;
  date: string;
  venue?: string;
  locationId?: string;
  description?: string;
  imageUrl?: string;
  themeColor?: string;
  status: EventStatus;
  seasonId?: string;
  companyIds?: string[];
  showId?: string;
  matchCards: MatchCardEntry[];
  attendance?: number;
  rating?: number;
  // When true, players cannot create or change their check-in for this event.
  checkInsLocked?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EnrichedMatchData {
  matchId: string;
  matchFormat: string;
  stipulationId?: string;
  stipulationName?: string;
  participants: {
    playerId: string;
    playerName: string;
    wrestlerName: string;
  }[];
  winners?: string[];
  losers?: string[];
  isChampionship: boolean;
  championshipName?: string;
  status: MatchStatus;
  slots?: HydratedMatchSlot[];
  slotsRequired?: number;
  starRating?: number;
  ratingsCount?: number;
  /** True if the calling user has already rated this match (RIV-24+). */
  userHasRated?: boolean;
  /** This user's rating for the match, if any (RIV-24+). */
  userRating?: number | null;
  matchOfTheNight?: boolean;
}

export interface EventWithMatches extends LeagueEvent {
  enrichedMatches: (MatchCardEntry & {
    matchData: EnrichedMatchData;
  })[];
}

export interface EventCalendarEntry {
  eventId: string;
  name: string;
  eventType: EventType;
  date: string;
  status: EventStatus;
  matchCount: number;
  championshipMatchCount: number;
  imageUrl?: string;
  showId?: string;
}

export interface CreateEventInput {
  name: string;
  eventType: EventType;
  date: string;
  venue?: string;
  locationId?: string;
  description?: string;
  imageUrl?: string;
  themeColor?: string;
  seasonId?: string;
  companyIds?: string[];
  showId?: string;
}

export type { Location } from './location';

export interface UpdateEventInput extends Partial<CreateEventInput> {
  eventId: string;
  status?: EventStatus;
  matchCards?: MatchCardEntry[];
  attendance?: number;
  rating?: number;
  companyIds?: string[];
  showId?: string;
  checkInsLocked?: boolean;
}

export type EventCheckInStatus = 'available' | 'tentative' | 'unavailable';

export interface EventCheckIn {
  eventId: string;
  playerId: string;
  status: EventCheckInStatus;
  checkedInAt: string;
  ttl?: number;
}

export interface EventCheckInSummary {
  eventId: string;
  available: number;
  tentative: number;
  unavailable: number;
  total: number;
}

export interface EventCheckInPlayerSummary {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
  divisionId?: string;
}

export interface EventCheckInRoster {
  available: EventCheckInPlayerSummary[];
  tentative: EventCheckInPlayerSummary[];
  unavailable: EventCheckInPlayerSummary[];
  noResponse: EventCheckInPlayerSummary[];
}

// ─── Commentary view (GET /events/{eventId}/commentary) ──────────────

export interface WinLossDraw {
  wins: number;
  losses: number;
  draws: number;
}

export interface CommentaryParticipant {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  imageUrl?: string;
  alignment?: 'face' | 'heel' | 'neutral';
  divisionName?: string;
  bio?: string;
  signatures: WrestlerMove[];
  finishers: WrestlerMove[];
  /** null when the league has no season to report against. */
  seasonRecord: WinLossDraw | null;
  allTimeRecord: WinLossDraw;
  /** Record in completed matches with three or more participants. */
  multiManRecord: WinLossDraw;
}

export interface CommentaryHeadToHead {
  player1Id: string;
  player2Id: string;
  player1Wins: number;
  player2Wins: number;
  draws: number;
  lastMatchDate?: string;
  lastWinnerId?: string;
}

export interface CommentaryMatch {
  matchId: string;
  position: number;
  designation: MatchDesignation;
  matchFormat: string;
  stipulationName?: string;
  isChampionship: boolean;
  championshipName?: string;
  status: MatchStatus;
  teams?: string[][];
  participants: CommentaryParticipant[];
  /** Every unordered pair of participants, in participant order. */
  headToHead: CommentaryHeadToHead[];
}

export interface EventCommentary {
  eventId: string;
  name: string;
  date: string;
  seasonName?: string;
  matches: CommentaryMatch[];
}
