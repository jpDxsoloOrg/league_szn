import type { CrudRepository } from './CrudRepository';
import type {
  LeagueEvent,
  EventStatus,
  EventCheckIn,
  EventCheckInStatus,
  Show,
  Company,
  Division,
  Location,
} from './types';

// ─── Event input types ──────────────────────────────────────────────

export interface EventCreateInput {
  name: string;
  eventType: 'ppv' | 'weekly' | 'special' | 'house';
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

export interface EventUpdateOptions {
  /** Refuse the write with a ConflictError unless the stored card still equals this list. */
  expectedMatchCards?: EventPatch['matchCards'];
}

export interface EventPatch {
  name?: string;
  eventType?: 'ppv' | 'weekly' | 'special' | 'house';
  date?: string;
  venue?: string;
  locationId?: string;
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
  checkInsLocked?: boolean;
}

// ─── Show input types ───────────────────────────────────────────────

export interface ShowCreateInput {
  name: string;
  companyId: string;
  description?: string;
  schedule?: string;
  dayOfWeek?: string;
  ppvDate?: string;
  imageUrl?: string;
}

export interface ShowPatch {
  name?: string;
  companyId?: string;
  description?: string;
  schedule?: string;
  dayOfWeek?: string;
  ppvDate?: string;
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

// ─── Location input types ───────────────────────────────────────────

export interface LocationCreateInput {
  name: string;
  city?: string;
  state?: string;
  country?: string;
  capacity?: number;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  notes?: string;
}

export interface LocationPatch {
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  capacity?: number;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  notes?: string;
}

export interface LocationBulkImportResult {
  created: number;
  skipped: number;
  skippedNames: string[];
}

export interface LocationsMethods extends CrudRepository<Location, LocationCreateInput, LocationPatch> {
  bulkImport(inputs: LocationCreateInput[]): Promise<LocationBulkImportResult>;
}

// ─── Aggregate interface ────────────────────────────────────────────

export interface LeagueOpsRepository {
  events: Omit<CrudRepository<LeagueEvent, EventCreateInput, EventPatch>, 'update'> & {
    update(eventId: string, patch: EventPatch, options?: EventUpdateOptions): Promise<LeagueEvent>;
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
  locations: LocationsMethods;
}
