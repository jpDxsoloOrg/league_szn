import { v4 as uuidv4 } from 'uuid';
import {
  buildThreadKey,
  type FactionDirectMessage,
  type FactionDirectMessagePostInput,
  type FactionDirectMessagesRepository,
  type FactionDirectThreadSummary,
  type FactionMessage,
  type FactionMessagePostInput,
  type FactionMessagesRepository,
  type ListPage,
  type ListPageOptions,
} from '../factionMessages';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const clampLimit = (n: number | undefined): number => {
  if (!n || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
};

/** In-memory cursor: simple offset encoded as base64 to mirror the public API. */
const encodeOffset = (offset: number): string =>
  Buffer.from(String(offset), 'utf-8').toString('base64');

const decodeOffset = (cursor: string | undefined): number => {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, 'base64').toString('utf-8'));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Invalid pagination cursor');
  }
  return n;
};

export class InMemoryFactionMessagesRepository implements FactionMessagesRepository {
  readonly store: FactionMessage[] = [];

  async list(
    factionId: string,
    opts: ListPageOptions = {},
  ): Promise<ListPage<FactionMessage>> {
    const all = this.store
      .filter((m) => m.factionId === factionId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first
    const limit = clampLimit(opts.limit);
    const offset = decodeOffset(opts.cursor);
    const items = all.slice(offset, offset + limit);
    const nextOffset = offset + items.length;
    return {
      items: items.map((m) => ({ ...m })),
      nextCursor: nextOffset < all.length ? encodeOffset(nextOffset) : undefined,
    };
  }

  async post(input: FactionMessagePostInput): Promise<FactionMessage> {
    const message: FactionMessage = {
      messageId: uuidv4(),
      factionId: input.factionId,
      authorPlayerId: input.authorPlayerId,
      body: input.body,
      messageType: input.messageType ?? 'user',
      createdAt: new Date().toISOString(),
    };
    this.store.push(message);
    return { ...message };
  }
}

export class InMemoryFactionDirectMessagesRepository implements FactionDirectMessagesRepository {
  readonly store: FactionDirectMessage[] = [];

  async listThread(
    factionId: string,
    threadKey: string,
    opts: ListPageOptions = {},
  ): Promise<ListPage<FactionDirectMessage>> {
    const all = this.store
      .filter((m) => m.factionId === factionId && m.threadKey === threadKey)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const limit = clampLimit(opts.limit);
    const offset = decodeOffset(opts.cursor);
    const items = all.slice(offset, offset + limit);
    const nextOffset = offset + items.length;
    return {
      items: items.map((m) => ({ ...m })),
      nextCursor: nextOffset < all.length ? encodeOffset(nextOffset) : undefined,
    };
  }

  async post(input: FactionDirectMessagePostInput): Promise<FactionDirectMessage> {
    const message: FactionDirectMessage = {
      messageId: uuidv4(),
      factionId: input.factionId,
      threadKey: buildThreadKey(input.senderPlayerId, input.recipientPlayerId),
      senderPlayerId: input.senderPlayerId,
      recipientPlayerId: input.recipientPlayerId,
      body: input.body,
      createdAt: new Date().toISOString(),
    };
    this.store.push(message);
    return { ...message };
  }

  async listThreadsForPlayer(
    factionId: string,
    playerId: string,
  ): Promise<FactionDirectThreadSummary[]> {
    const inFaction = this.store.filter(
      (m) =>
        m.factionId === factionId &&
        (m.senderPlayerId === playerId || m.recipientPlayerId === playerId),
    );

    const byThread = new Map<string, FactionDirectMessage>();
    for (const m of inFaction) {
      const existing = byThread.get(m.threadKey);
      if (!existing || m.createdAt > existing.createdAt) {
        byThread.set(m.threadKey, m);
      }
    }

    return Array.from(byThread.values())
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((lastMessage) => ({
        threadKey: lastMessage.threadKey,
        partnerPlayerId:
          lastMessage.senderPlayerId === playerId
            ? lastMessage.recipientPlayerId
            : lastMessage.senderPlayerId,
        lastMessage: { ...lastMessage },
        unreadCount: 0,
      }));
  }
}
