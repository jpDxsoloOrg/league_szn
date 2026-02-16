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
  description?: string;
  imageUrl?: string;
  themeColor?: string;
  status: EventStatus;
  seasonId?: string;
  matchCards: MatchCardEntry[];
  attendance?: number;
  rating?: number;
  fantasyEnabled?: boolean;
  fantasyLocked?: boolean;
  fantasyBudget?: number;
  fantasyPicksPerDivision?: number;
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
  status: 'scheduled' | 'completed';
  starRating?: number;
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
}

export interface CreateEventInput {
  name: string;
  eventType: EventType;
  date: string;
  venue?: string;
  description?: string;
  imageUrl?: string;
  themeColor?: string;
  seasonId?: string;
  fantasyEnabled?: boolean;
  fantasyBudget?: number;
  fantasyPicksPerDivision?: number;
}

export interface UpdateEventInput extends Partial<CreateEventInput> {
  eventId: string;
  status?: EventStatus;
  matchCards?: MatchCardEntry[];
  attendance?: number;
  rating?: number;
  fantasyEnabled?: boolean;
  fantasyLocked?: boolean;
  fantasyBudget?: number;
  fantasyPicksPerDivision?: number;
}
