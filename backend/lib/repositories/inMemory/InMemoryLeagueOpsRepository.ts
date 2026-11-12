import { v4 as uuidv4 } from 'uuid';
import { isDeepStrictEqual } from 'node:util';
import { ConflictError, NotFoundError } from '../errors';
import { InMemoryCrudRepository } from './InMemoryCrudRepository';
import type {
  LeagueOpsRepository,
  EventCreateInput,
  EventPatch,
  EventUpdateOptions,
  ShowCreateInput,
  ShowPatch,
  CompanyCreateInput,
  CompanyPatch,
  DivisionCreateInput,
  DivisionPatch,
  LocationCreateInput,
  LocationPatch,
  LocationBulkImportResult,
  LocationsMethods,
} from '../LeagueOpsRepository';
import type {
  LeagueEvent,
  EventStatus,
  EventCheckIn,
  EventCheckInStatus,
  Show,
  Company,
  Division,
  Location,
} from '../types';
import type { CrudRepository } from '../CrudRepository';

// ─── Events (CRUD + queries + check-ins) ───────────────────────────

type EventsCrud = Omit<CrudRepository<LeagueEvent, EventCreateInput, EventPatch>, 'update'> & {
  update(eventId: string, patch: EventPatch, options?: EventUpdateOptions): Promise<LeagueEvent>;
  listByStatus(status: EventStatus): Promise<LeagueEvent[]>;
  listBySeason(seasonId: string): Promise<LeagueEvent[]>;
  listByEventType(eventType: string): Promise<LeagueEvent[]>;
  listByDateRange(from: string, to: string): Promise<LeagueEvent[]>;
  getCheckIn(eventId: string, playerId: string): Promise<EventCheckIn | null>;
  listCheckIns(eventId: string): Promise<EventCheckIn[]>;
  upsertCheckIn(eventId: string, playerId: string, status: EventCheckInStatus): Promise<EventCheckIn>;
  deleteCheckIn(eventId: string, playerId: string): Promise<void>;
};

function createEventsSubRepo(): EventsCrud {
  const events = new Map<string, LeagueEvent>();
  const checkIns = new Map<string, EventCheckIn>();

  const checkInKey = (eventId: string, playerId: string): string => `${eventId}#${playerId}`;

  return {
    async findById(eventId: string): Promise<LeagueEvent | null> {
      return events.get(eventId) ?? null;
    },

    async list(): Promise<LeagueEvent[]> {
      return Array.from(events.values()).sort((a, b) => b.date.localeCompare(a.date));
    },

    async listByStatus(status: EventStatus): Promise<LeagueEvent[]> {
      return Array.from(events.values())
        .filter((e) => e.status === status)
        .sort((a, b) => b.date.localeCompare(a.date));
    },

    async listBySeason(seasonId: string): Promise<LeagueEvent[]> {
      return Array.from(events.values())
        .filter((e) => e.seasonId === seasonId)
        .sort((a, b) => b.date.localeCompare(a.date));
    },

    async listByEventType(eventType: string): Promise<LeagueEvent[]> {
      return Array.from(events.values())
        .filter((e) => e.eventType === eventType)
        .sort((a, b) => b.date.localeCompare(a.date));
    },

    async listByDateRange(from: string, to: string): Promise<LeagueEvent[]> {
      return Array.from(events.values())
        .filter((e) => e.date >= from && e.date <= to)
        .sort((a, b) => b.date.localeCompare(a.date));
    },

    async create(input: EventCreateInput): Promise<LeagueEvent> {
      const now = new Date().toISOString();
      const item: LeagueEvent = {
        eventId: uuidv4(),
        name: input.name,
        eventType: input.eventType,
        date: input.date,
        venue: input.venue,
        locationId: input.locationId,
        description: input.description,
        imageUrl: input.imageUrl,
        themeColor: input.themeColor,
        status: 'upcoming',
        seasonId: input.seasonId,
        companyIds: input.companyIds,
        showId: input.showId,
        matchCards: [],
        createdAt: now,
        updatedAt: now,
      };
      events.set(item.eventId, item);
      return item;
    },

    async update(eventId: string, patch: EventPatch, options?: EventUpdateOptions): Promise<LeagueEvent> {
      const existing = events.get(eventId);
      if (!existing) throw new NotFoundError('Event', eventId);
      if (options?.expectedMatchCards && !isDeepStrictEqual(existing.matchCards, options.expectedMatchCards)) {
        throw new ConflictError('The match card has changed');
      }
      const updated: LeagueEvent = {
        ...existing,
        ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
        updatedAt: new Date().toISOString(),
      };
      events.set(eventId, updated);
      return updated;
    },

    async delete(eventId: string): Promise<void> {
      events.delete(eventId);
      // Also remove associated check-ins
      for (const key of checkIns.keys()) {
        if (key.startsWith(`${eventId}#`)) {
          checkIns.delete(key);
        }
      }
    },

    // ─── Check-ins ─────────────────────────────────────────────────

    async getCheckIn(eventId: string, playerId: string): Promise<EventCheckIn | null> {
      return checkIns.get(checkInKey(eventId, playerId)) ?? null;
    },

    async listCheckIns(eventId: string): Promise<EventCheckIn[]> {
      return Array.from(checkIns.values()).filter((ci) => ci.eventId === eventId);
    },

    async upsertCheckIn(
      eventId: string,
      playerId: string,
      status: EventCheckInStatus,
    ): Promise<EventCheckIn> {
      const now = new Date().toISOString();
      const item: EventCheckIn = {
        eventId,
        playerId,
        status,
        checkedInAt: now,
      };
      checkIns.set(checkInKey(eventId, playerId), item);
      return item;
    },

    async deleteCheckIn(eventId: string, playerId: string): Promise<void> {
      checkIns.delete(checkInKey(eventId, playerId));
    },
  };
}

// ─── Shows (CRUD + listByCompany) ──────────────────────────────────

type ShowsCrud = CrudRepository<Show, ShowCreateInput, ShowPatch> & {
  listByCompany(companyId: string): Promise<Show[]>;
};

class ShowsSubRepo extends InMemoryCrudRepository<Show, ShowCreateInput, ShowPatch> {
  constructor() {
    super({
      idField: 'showId',
      entityName: 'Show',
      buildItem: (input: ShowCreateInput, id: string, now: string): Show => ({
        showId: id,
        name: input.name,
        companyId: input.companyId,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.schedule !== undefined ? { schedule: input.schedule } : {}),
        ...(input.dayOfWeek !== undefined ? { dayOfWeek: input.dayOfWeek } : {}),
        ...(input.ppvDate !== undefined ? { ppvDate: input.ppvDate } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        createdAt: now,
        updatedAt: now,
      }),
    });
  }

  async listByCompany(companyId: string): Promise<Show[]> {
    return Array.from(this.store.values())
      .filter((s) => s.companyId === companyId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }
}

// ─── Locations (CRUD + bulkImport) ─────────────────────────────────

class LocationsSubRepo
  extends InMemoryCrudRepository<Location, LocationCreateInput, LocationPatch>
  implements LocationsMethods
{
  constructor() {
    super({
      idField: 'locationId',
      entityName: 'Location',
      buildItem: (input: LocationCreateInput, id: string, now: string): Location => ({
        locationId: id,
        name: input.name,
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
        ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        createdAt: now,
        updatedAt: now,
      }),
    });
  }

  async bulkImport(inputs: LocationCreateInput[]): Promise<LocationBulkImportResult> {
    const existingNames = new Set(
      Array.from(this.store.values()).map((loc) => loc.name.toLowerCase()),
    );

    const seenInPayload = new Set<string>();
    const skippedNames: string[] = [];
    let created = 0;

    for (const input of inputs) {
      const key = input.name.toLowerCase();
      if (seenInPayload.has(key) || existingNames.has(key)) {
        skippedNames.push(input.name);
        continue;
      }
      seenInPayload.add(key);
      await this.create(input);
      created += 1;
    }

    return { created, skipped: skippedNames.length, skippedNames };
  }
}

// ─── Aggregate ─────────────────────────────────────────────────────

export class InMemoryLeagueOpsRepository implements LeagueOpsRepository {
  readonly events: EventsCrud;
  readonly shows: ShowsCrud;
  readonly companies: InMemoryCrudRepository<Company, CompanyCreateInput, CompanyPatch>;
  readonly divisions: InMemoryCrudRepository<Division, DivisionCreateInput, DivisionPatch>;
  readonly locations: LocationsMethods;

  constructor() {
    this.events = createEventsSubRepo();

    this.shows = new ShowsSubRepo();

    this.companies = new InMemoryCrudRepository<Company, CompanyCreateInput, CompanyPatch>({
      idField: 'companyId',
      entityName: 'Company',
      buildItem: (input: CompanyCreateInput, id: string, now: string): Company => ({
        companyId: id,
        name: input.name,
        ...(input.abbreviation !== undefined ? { abbreviation: input.abbreviation } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        createdAt: now,
        updatedAt: now,
      }),
    });

    this.divisions = new InMemoryCrudRepository<Division, DivisionCreateInput, DivisionPatch>({
      idField: 'divisionId',
      entityName: 'Division',
      buildItem: (input: DivisionCreateInput, id: string, now: string): Division => ({
        divisionId: id,
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isDevelopmental !== undefined ? { isDevelopmental: input.isDevelopmental } : {}),
        ...(input.isDefaultForNewWrestlers !== undefined
          ? { isDefaultForNewWrestlers: input.isDefaultForNewWrestlers }
          : {}),
        createdAt: now,
        updatedAt: now,
      }),
    });

    this.locations = new LocationsSubRepo();
  }
}
