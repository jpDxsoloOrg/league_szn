import {
  clampLedgerPageSize,
  type LedgerEntry,
  type LedgerIdempotencyRecord,
  type LedgerPage,
  type LedgerRepository,
} from '../ledger';

const encodeOffset = (offset: number): string => Buffer.from(String(offset)).toString('base64');

const decodeOffset = (cursor: string | undefined): number => {
  if (!cursor) return 0;
  const offset = Number(Buffer.from(cursor, 'base64').toString('utf-8'));
  if (!Number.isInteger(offset) || offset < 0) throw new Error('Invalid pagination cursor');
  return offset;
};

export class InMemoryLedgerRepository implements LedgerRepository {
  /** Shared with InMemoryUnitOfWork, which is the only writer. */
  readonly entriesStore: LedgerEntry[] = [];
  readonly idempotencyStore = new Map<string, LedgerIdempotencyRecord>();

  async listForPlayer(playerId: string, cursor?: string, limit?: number): Promise<LedgerPage> {
    const all = this.entriesStore
      .filter((entry) => entry.playerId === playerId)
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    const offset = decodeOffset(cursor);
    const items = all.slice(offset, offset + clampLedgerPageSize(limit));
    const nextOffset = offset + items.length;
    return {
      items: items.map((entry) => ({ ...entry })),
      ...(nextOffset < all.length && { nextCursor: encodeOffset(nextOffset) }),
    };
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<LedgerEntry | null> {
    const record = this.idempotencyStore.get(idempotencyKey);
    if (!record) return null;
    const entry = this.entriesStore.find(
      (row) => row.playerId === record.playerId && row.sortKey === record.sortKey,
    );
    return entry ? { ...entry } : null;
  }

  async getByEntryId(entryId: string): Promise<LedgerEntry | null> {
    const entry = this.entriesStore.find((row) => row.entryId === entryId);
    return entry ? { ...entry } : null;
  }
}
