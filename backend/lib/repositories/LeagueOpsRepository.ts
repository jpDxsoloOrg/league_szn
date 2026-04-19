import type { CrudRepository } from './CrudRepository';
import type {
  LeagueEvent,
  EventStatus,
  EventCheckIn,
  EventCheckInStatus,
  Show,
  Company,
  Division,
} from './types';

// ─── Event input types ──────────────────────────────────────────────

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

// ─── Show input types ───────────────────────────────────────────────

export interface ShowCreateInput {
  name: string;
  companyId: string;
  description?: string;
  schedule?: string;
  dayOfWeek?: string;
  imageUrl?: string;
}

export interface ShowPatch {
  name?: string;
  companyId?: string;
  description?: string;
  schedule?: string;
  dayOfWeek?: string;
  imageUrl?: string;
}

// ─── Company input types ────────────────────────────────────────────

export interface CompanyCreateInput {
  name: string;
  abbreviation?: string;
  imageUrl?: string;
  description?: string;
}

export interface CompanyPatch {
  name?: string;
  abbreviation?: string;
  imageUrl?: string;
  description?: string;
}

// ─── Division input types ───────────────────────────────────────────

export interface DivisionCreateInput {
  name: string;
  description?: string;
}

export interface DivisionPatch {
  name?: string;
  description?: string;
}

// ─── Matchmaking types ──────────────────────────────────────────────

export interface PresenceRecord {
  playerId: string;
  lastSeenAt: string;
  ttl: number;
}

export interface QueueRecord {
  playerId: string;
  joinedAt: string;
  preferences?: { matchFormat?: string; stipulationId?: string };
  ttl: number;
}

export interface InvitationRecord {
  invitationId: string;
  fromPlayerId: string;
  toPlayerId: string;
  matchFormat?: string;
  stipulationId?: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  updatedAt?: string;
  acceptedAt?: string;
  ttl: number;
  [key: string]: unknown;
}

// ─── Sub-interfaces ─────────────────────────────────────────────────

export interface MatchmakingMethods {
  // Presence
  putPresence(record: PresenceRecord): Promise<void>;
  getPresence(playerId: string): Promise<PresenceRecord | null>;
  listPresence(): Promise<PresenceRecord[]>;
  deletePresence(playerId: string): Promise<void>;

  // Queue
  putQueue(record: QueueRecord): Promise<void>;
  listQueue(): Promise<QueueRecord[]>;
  deleteQueue(playerId: string): Promise<void>;

  // Invitations
  putInvitation(record: InvitationRecord): Promise<void>;
  getInvitation(invitationId: string): Promise<InvitationRecord | null>;
  listInvitationsByToPlayer(toPlayerId: string): Promise<InvitationRecord[]>;
  listInvitationsByFromPlayer(fromPlayerId: string): Promise<InvitationRecord[]>;
  updateInvitation(invitationId: string, patch: Record<string, unknown>, conditionStatus?: string): Promise<InvitationRecord>;
}

// ─── Aggregate interface ────────────────────────────────────────────

export interface LeagueOpsRepository {
  events: CrudRepository<LeagueEvent, EventCreateInput, EventPatch> & {
    listByStatus(status: EventStatus): Promise<LeagueEvent[]>;
    listBySeason(seasonId: string): Promise<LeagueEvent[]>;
    listByEventType(eventType: string): Promise<LeagueEvent[]>;
    listByDateRange(from: string, to: string): Promise<LeagueEvent[]>;

    // Check-ins
    getCheckIn(eventId: string, playerId: string): Promise<EventCheckIn | null>;
    listCheckIns(eventId: string): Promise<EventCheckIn[]>;
    upsertCheckIn(eventId: string, playerId: string, status: EventCheckInStatus): Promise<EventCheckIn>;
    deleteCheckIn(eventId: string, playerId: string): Promise<void>;
  };
  shows: CrudRepository<Show, ShowCreateInput, ShowPatch> & {
    listByCompany(companyId: string): Promise<Show[]>;
  };
  companies: CrudRepository<Company, CompanyCreateInput, CompanyPatch>;
  divisions: CrudRepository<Division, DivisionCreateInput, DivisionPatch>;
  matchmaking: MatchmakingMethods;
}
