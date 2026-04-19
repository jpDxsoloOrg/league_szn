import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import { InMemoryCrudRepository } from './InMemoryCrudRepository';
import type {
  LeagueOpsRepository,
  EventCreateInput,
  EventPatch,
  ShowCreateInput,
  ShowPatch,
  CompanyCreateInput,
  CompanyPatch,
  DivisionCreateInput,
  DivisionPatch,
  MatchmakingMethods,
  PresenceRecord,
  QueueRecord,
  InvitationRecord,
} from '../LeagueOpsRepository';
import type {
  LeagueEvent,
  EventStatus,
  EventCheckIn,
  EventCheckInStatus,
  Show,
  Company,
  Division,
} from '../types';
import type { CrudRepository } from '../CrudRepository';

// ─── Events (CRUD + queries + check-ins) ───────────────────────────

type EventsCrud = CrudRepository<LeagueEvent, EventCreateInput, EventPatch> & {
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
        description: input.description,
        imageUrl: input.imageUrl,
        themeColor: input.themeColor,
        status: 'upcoming',
        seasonId: input.seasonId,
        companyIds: input.companyIds,
        showId: input.showId,
        matchCards: [],
        fantasyEnabled: input.fantasyEnabled,
        fantasyBudget: input.fantasyBudget,
        fantasyPicksPerDivision: input.fantasyPicksPerDivision,
        createdAt: now,
        updatedAt: now,
      };
      events.set(item.eventId, item);
      return item;
    },

    async update(eventId: string, patch: EventPatch): Promise<LeagueEvent> {
      const existing = events.get(eventId);
      if (!existing) throw new NotFoundError('Event', eventId);
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

// ─── Matchmaking ───────────────────────────────────────────────────

function createMatchmakingSubRepo(): MatchmakingMethods {
  const presenceStore = new Map<string, PresenceRecord>();
  const queueStore = new Map<string, QueueRecord>();
  const invitationStore = new Map<string, InvitationRecord>();

  return {
    // Presence
    async putPresence(record: PresenceRecord): Promise<void> {
      presenceStore.set(record.playerId, record);
    },
    async getPresence(playerId: string): Promise<PresenceRecord | null> {
      return presenceStore.get(playerId) ?? null;
    },
    async listPresence(): Promise<PresenceRecord[]> {
      return Array.from(presenceStore.values());
    },
    async deletePresence(playerId: string): Promise<void> {
      presenceStore.delete(playerId);
    },

    // Queue
    async putQueue(record: QueueRecord): Promise<void> {
      queueStore.set(record.playerId, record);
    },
    async listQueue(): Promise<QueueRecord[]> {
      return Array.from(queueStore.values());
    },
    async deleteQueue(playerId: string): Promise<void> {
      queueStore.delete(playerId);
    },

    // Invitations
    async putInvitation(record: InvitationRecord): Promise<void> {
      invitationStore.set(record.invitationId, record);
    },
    async getInvitation(invitationId: string): Promise<InvitationRecord | null> {
      return invitationStore.get(invitationId) ?? null;
    },
    async listInvitationsByToPlayer(toPlayerId: string): Promise<InvitationRecord[]> {
      return Array.from(invitationStore.values()).filter(
        (inv) => inv.toPlayerId === toPlayerId,
      );
    },
    async listInvitationsByFromPlayer(fromPlayerId: string): Promise<InvitationRecord[]> {
      return Array.from(invitationStore.values()).filter(
        (inv) => inv.fromPlayerId === fromPlayerId,
      );
    },
    async updateInvitation(
      invitationId: string,
      patch: Record<string, unknown>,
      conditionStatus?: string,
    ): Promise<InvitationRecord> {
      const existing = invitationStore.get(invitationId);
      if (!existing) throw new Error('Invitation not found');
      if (conditionStatus && existing.status !== conditionStatus) {
        const err = new Error('Condition not met');
        (err as unknown as Record<string, string>).name = 'ConditionalCheckFailedException';
        throw err;
      }
      const updated: InvitationRecord = { ...existing, ...patch } as InvitationRecord;
      invitationStore.set(invitationId, updated);
      return updated;
    },
  };
}

// ─── Aggregate ─────────────────────────────────────────────────────

export class InMemoryLeagueOpsRepository implements LeagueOpsRepository {
  readonly events: EventsCrud;
  readonly shows: ShowsCrud;
  readonly companies: InMemoryCrudRepository<Company, CompanyCreateInput, CompanyPatch>;
  readonly divisions: InMemoryCrudRepository<Division, DivisionCreateInput, DivisionPatch>;
  readonly matchmaking: MatchmakingMethods;

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
        createdAt: now,
        updatedAt: now,
      }),
    });

    this.matchmaking = createMatchmakingSubRepo();
  }
}
