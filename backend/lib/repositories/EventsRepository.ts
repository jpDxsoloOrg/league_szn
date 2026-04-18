import type { LeagueEvent, EventStatus, EventCheckIn, EventCheckInStatus } from './types';

export interface EventCreateInput {
  name: string;
  eventType: 'ppv' | 'weekly' | 'special' | 'house';
  date: string;
  venue?: string;
  description?: string;
  imageUrl?: string;
  themeColor?: string;
  seasonId?: string;
  companyIds?: string[];
  showId?: string;
  fantasyEnabled?: boolean;
  fantasyBudget?: number;
  fantasyPicksPerDivision?: number;
}

export interface EventPatch {
  name?: string;
  eventType?: 'ppv' | 'weekly' | 'special' | 'house';
  date?: string;
  venue?: string;
  description?: string;
  imageUrl?: string;
  themeColor?: string;
  status?: EventStatus;
  seasonId?: string;
  companyIds?: string[];
  showId?: string;
  matchCards?: LeagueEvent['matchCards'];
  attendance?: number;
  rating?: number;
  fantasyEnabled?: boolean;
  fantasyLocked?: boolean;
  fantasyBudget?: number;
  fantasyPicksPerDivision?: number;
}

export interface EventsRepository {
  findById(eventId: string): Promise<LeagueEvent | null>;
  list(): Promise<LeagueEvent[]>;
  listByStatus(status: EventStatus): Promise<LeagueEvent[]>;
  listBySeason(seasonId: string): Promise<LeagueEvent[]>;
  listByEventType(eventType: string): Promise<LeagueEvent[]>;
  listByDateRange(from: string, to: string): Promise<LeagueEvent[]>;
  create(input: EventCreateInput): Promise<LeagueEvent>;
  update(eventId: string, patch: EventPatch): Promise<LeagueEvent>;
  delete(eventId: string): Promise<void>;

  // Check-ins
  getCheckIn(eventId: string, playerId: string): Promise<EventCheckIn | null>;
  listCheckIns(eventId: string): Promise<EventCheckIn[]>;
  upsertCheckIn(eventId: string, playerId: string, status: EventCheckInStatus): Promise<EventCheckIn>;
  deleteCheckIn(eventId: string, playerId: string): Promise<void>;
}
