import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  EventCreateInput,
  EventPatch,
  EventsRepository,
} from '../EventsRepository';
import type { LeagueEvent, EventStatus, EventCheckIn, EventCheckInStatus } from '../types';

export class InMemoryEventsRepository implements EventsRepository {
  readonly events = new Map<string, LeagueEvent>();
  /** Keyed by `${eventId}#${playerId}` */
  readonly checkIns = new Map<string, EventCheckIn>();

  // ─── Events ──────────────────────────────────────────────────────

  async findById(eventId: string): Promise<LeagueEvent | null> {
    return this.events.get(eventId) ?? null;
  }

  async list(): Promise<LeagueEvent[]> {
    return Array.from(this.events.values()).sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  }

  async listByStatus(status: EventStatus): Promise<LeagueEvent[]> {
    return Array.from(this.events.values())
      .filter((e) => e.status === status)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async listBySeason(seasonId: string): Promise<LeagueEvent[]> {
    return Array.from(this.events.values())
      .filter((e) => e.seasonId === seasonId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async listByEventType(eventType: string): Promise<LeagueEvent[]> {
    return Array.from(this.events.values())
      .filter((e) => e.eventType === eventType)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async listByDateRange(from: string, to: string): Promise<LeagueEvent[]> {
    return Array.from(this.events.values())
      .filter((e) => e.date >= from && e.date <= to)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

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
    this.events.set(item.eventId, item);
    return item;
  }

  async update(eventId: string, patch: EventPatch): Promise<LeagueEvent> {
    const existing = this.events.get(eventId);
    if (!existing) throw new NotFoundError('Event', eventId);
    const updated: LeagueEvent = {
      ...existing,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      updatedAt: new Date().toISOString(),
    };
    this.events.set(eventId, updated);
    return updated;
  }

  async delete(eventId: string): Promise<void> {
    this.events.delete(eventId);
    // Also remove associated check-ins
    for (const key of this.checkIns.keys()) {
      if (key.startsWith(`${eventId}#`)) {
        this.checkIns.delete(key);
      }
    }
  }

  // ─── Check-ins ───────────────────────────────────────────────────

  private checkInKey(eventId: string, playerId: string): string {
    return `${eventId}#${playerId}`;
  }

  async getCheckIn(eventId: string, playerId: string): Promise<EventCheckIn | null> {
    return this.checkIns.get(this.checkInKey(eventId, playerId)) ?? null;
  }

  async listCheckIns(eventId: string): Promise<EventCheckIn[]> {
    return Array.from(this.checkIns.values()).filter(
      (ci) => ci.eventId === eventId,
    );
  }

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
    this.checkIns.set(this.checkInKey(eventId, playerId), item);
    return item;
  }

  async deleteCheckIn(eventId: string, playerId: string): Promise<void> {
    this.checkIns.delete(this.checkInKey(eventId, playerId));
  }
}
