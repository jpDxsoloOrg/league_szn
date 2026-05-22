import { v4 as uuidv4 } from 'uuid';
import {
  type CreateRivalryInput,
  type ListPage,
  type ListPageOptions,
  type RivalriesRepository,
  type Rivalry,
  type RivalryMessage,
  type RivalryMessagePostInput,
  type RivalryMessagesRepository,
  type RivalryNote,
  type RivalryNoteCreateInput,
  type RivalryNotePatch,
  type RivalryNoteType,
  type RivalryNotesRepository,
  type RivalryParticipant,
  type RivalryParticipantRole,
  type RivalryPatch,
  type RivalryStatus,
} from '../rivalries';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const clampLimit = (n: number | undefined): number => {
  if (!n || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
};

const encodeOffset = (offset: number): string =>
  Buffer.from(String(offset), 'utf-8').toString('base64');

const decodeOffset = (cursor: string | undefined): number => {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, 'base64').toString('utf-8'));
  if (!Number.isFinite(n) || n < 0) throw new Error('Invalid pagination cursor');
  return n;
};

function paginate<T>(all: T[], opts: ListPageOptions): ListPage<T> {
  const limit = clampLimit(opts.limit);
  const offset = decodeOffset(opts.cursor);
  const items = all.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    items,
    nextCursor: nextOffset < all.length ? encodeOffset(nextOffset) : undefined,
  };
}

export class InMemoryRivalriesRepository implements RivalriesRepository {
  /** Public for the UnitOfWork to stage writes against. */
  readonly store: Map<string, Rivalry> = new Map();

  async get(rivalryId: string): Promise<Rivalry | undefined> {
    const existing = this.store.get(rivalryId);
    return existing ? cloneRivalry(existing) : undefined;
  }

  async listByParticipant(
    playerId: string,
    opts: ListPageOptions = {},
  ): Promise<ListPage<Rivalry>> {
    const all = Array.from(this.store.values())
      .filter((r) => r.participants.some((p) => p.playerId === playerId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(cloneRivalry);
    return paginate(all, opts);
  }

  async listByStatus(
    status: RivalryStatus,
    opts: ListPageOptions = {},
  ): Promise<ListPage<Rivalry>> {
    const all = Array.from(this.store.values())
      .filter((r) => r.status === status)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(cloneRivalry);
    return paginate(all, opts);
  }

  async create(input: CreateRivalryInput): Promise<Rivalry> {
    const now = new Date().toISOString();
    const rivalry: Rivalry = {
      rivalryId: uuidv4(),
      title: input.title,
      description: input.description,
      status: 'pending',
      heat: input.heat ?? 'warm',
      requestedBy: input.requestedBy,
      participants: input.participants.map((p) => {
        const participant: RivalryParticipant = {
          playerId: p.playerId,
          role: p.role ?? 'rival',
          addedAt: now,
        };
        if (p.wrestlerVariant) participant.wrestlerVariant = p.wrestlerVariant;
        return participant;
      }),
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(rivalry.rivalryId, rivalry);
    return cloneRivalry(rivalry);
  }

  async update(rivalryId: string, patch: RivalryPatch): Promise<Rivalry> {
    const existing = this.store.get(rivalryId);
    if (!existing) throw new Error(`Rivalry ${rivalryId} not found`);
    const next: Rivalry = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(rivalryId, next);
    return cloneRivalry(next);
  }

  async addParticipant(
    rivalryId: string,
    playerId: string,
    role: RivalryParticipantRole = 'rival',
    wrestlerVariant?: 'primary' | 'alternate',
  ): Promise<RivalryParticipant> {
    const existing = this.store.get(rivalryId);
    if (!existing) throw new Error(`Rivalry ${rivalryId} not found`);
    const addedAt = new Date().toISOString();
    const participant: RivalryParticipant = { playerId, role, addedAt };
    if (wrestlerVariant) participant.wrestlerVariant = wrestlerVariant;
    const filtered = existing.participants.filter((p) => p.playerId !== playerId);
    this.store.set(rivalryId, {
      ...existing,
      participants: [...filtered, participant],
      updatedAt: addedAt,
    });
    return { ...participant };
  }

  async removeParticipant(rivalryId: string, playerId: string): Promise<void> {
    const existing = this.store.get(rivalryId);
    if (!existing) return;
    this.store.set(rivalryId, {
      ...existing,
      participants: existing.participants.filter((p) => p.playerId !== playerId),
      updatedAt: new Date().toISOString(),
    });
  }

  async delete(rivalryId: string): Promise<void> {
    this.store.delete(rivalryId);
  }
}

function cloneRivalry(r: Rivalry): Rivalry {
  return { ...r, participants: r.participants.map((p) => ({ ...p })) };
}

export class InMemoryRivalryMessagesRepository implements RivalryMessagesRepository {
  readonly store: RivalryMessage[] = [];

  async list(
    rivalryId: string,
    opts: ListPageOptions = {},
  ): Promise<ListPage<RivalryMessage>> {
    const all = this.store
      .filter((m) => m.rivalryId === rivalryId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((m) => ({ ...m }));
    return paginate(all, opts);
  }

  async post(input: RivalryMessagePostInput): Promise<RivalryMessage> {
    const message: RivalryMessage = {
      rivalryId: input.rivalryId,
      messageId: uuidv4(),
      authorPlayerId: input.authorPlayerId,
      body: input.body,
      audience: input.audience ?? 'all',
      createdAt: new Date().toISOString(),
    };
    this.store.push(message);
    return { ...message };
  }
}

export class InMemoryRivalryNotesRepository implements RivalryNotesRepository {
  readonly store: RivalryNote[] = [];

  async listByRivalry(rivalryId: string): Promise<RivalryNote[]> {
    return this.store
      .filter((n) => n.rivalryId === rivalryId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((n) => ({ ...n }));
  }

  async listByType(
    noteType: RivalryNoteType,
    opts: ListPageOptions = {},
  ): Promise<ListPage<RivalryNote>> {
    const all = this.store
      .filter((n) => n.noteType === noteType)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((n) => ({ ...n }));
    return paginate(all, opts);
  }

  async create(input: RivalryNoteCreateInput): Promise<RivalryNote> {
    const now = new Date().toISOString();
    const note: RivalryNote = {
      rivalryId: input.rivalryId,
      noteId: uuidv4(),
      noteType: input.noteType,
      visibility: input.visibility,
      body: input.body,
      authorPlayerId: input.authorPlayerId,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(note);
    return { ...note };
  }

  async update(
    rivalryId: string,
    noteId: string,
    patch: RivalryNotePatch,
  ): Promise<RivalryNote> {
    const existing = this.store.find(
      (n) => n.rivalryId === rivalryId && n.noteId === noteId,
    );
    if (!existing) throw new Error(`Note ${noteId} not found`);
    Object.assign(existing, patch, { updatedAt: new Date().toISOString() });
    return { ...existing };
  }

  async delete(rivalryId: string, noteId: string): Promise<void> {
    const idx = this.store.findIndex(
      (n) => n.rivalryId === rivalryId && n.noteId === noteId,
    );
    if (idx >= 0) this.store.splice(idx, 1);
  }
}
