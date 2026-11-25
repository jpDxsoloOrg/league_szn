import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});

import { buildInMemoryRepositories } from '../index';
import type { Repositories } from '../../registry';
import { ConcurrencyError, NotFoundError } from '../../errors';
import {
  DuplicatePostingError,
  InvalidLedgerPostingError,
  type PostLedgerEntryInput,
} from '../../ledger';

let repos: Repositories;
let playerId: string;

const post = (overrides: Partial<PostLedgerEntryInput> = {}) =>
  repos.runInTransaction(async (tx) => tx.postLedgerEntry({
    playerId,
    kind: 'perMatchPay',
    amount: 100,
    idempotencyKey: `key-${Math.random()}`,
    ...overrides,
  }));

const balance = async (): Promise<number | undefined> => (await repos.roster.players.findById(playerId))?.balance;

beforeEach(async () => {
  vi.useRealTimers();
  repos = buildInMemoryRepositories();
  playerId = (await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock' })).playerId;
});

describe('postLedgerEntry', () => {
  it('starts from a missing balance as 0 and keeps balance equal to the sum of entries', async () => {
    expect(await balance()).toBeUndefined();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-01-01T00:00:00.000Z'));
    await post({ amount: 100, idempotencyKey: 'a' });
    vi.setSystemTime(Date.parse('2026-01-01T00:00:01.000Z'));
    await post({ kind: 'fine', amount: -30, idempotencyKey: 'b' });
    vi.setSystemTime(Date.parse('2026-01-01T00:00:02.000Z'));
    await post({ kind: 'winBonus', amount: 55, idempotencyKey: 'c' });
    vi.useRealTimers();

    expect(await balance()).toBe(125);
    const { items } = await repos.ledger.listForPlayer(playerId);
    expect(items.map((entry) => [entry.idempotencyKey, entry.amount, entry.balanceAfter])).toEqual([
      ['c', 55, 125],
      ['b', -30, 70],
      ['a', 100, 100],
    ]);
    expect(items.reduce((sum, entry) => sum + entry.amount, 0)).toBe(125);
  });

  it('stores the ref, note and actor on the entry and returns its ids', async () => {
    const staged = await post({
      kind: 'gmAdjust',
      amount: 10,
      idempotencyKey: 'ref-key',
      ref: { type: 'match', id: 'm1' },
      note: 'Correction',
      actorUserId: 'admin-sub',
    });
    const entry = await repos.ledger.getByIdempotencyKey('ref-key');
    expect(entry).toMatchObject({
      playerId,
      entryId: staged.entryId,
      createdAt: staged.createdAt,
      sortKey: `${staged.createdAt}#${staged.entryId}`,
      kind: 'gmAdjust',
      refType: 'match',
      refId: 'm1',
      note: 'Correction',
      actorUserId: 'admin-sub',
    });
    expect(await repos.ledger.getByEntryId(staged.entryId)).toEqual(entry);
  });

  it('posts a duplicate key once and fails the whole unit of work', async () => {
    const otherId = (await repos.roster.players.create({ name: 'Austin', currentWrestler: 'Stone Cold' })).playerId;
    await post({ idempotencyKey: 'match#m1#pay#p1' });

    await expect(repos.runInTransaction(async (tx) => {
      tx.postLedgerEntry({ playerId: otherId, kind: 'perMatchPay', amount: 100, idempotencyKey: 'fresh' });
      tx.postLedgerEntry({ playerId, kind: 'perMatchPay', amount: 100, idempotencyKey: 'match#m1#pay#p1' });
    })).rejects.toBeInstanceOf(DuplicatePostingError);

    expect(await balance()).toBe(100);
    expect((await repos.roster.players.findById(otherId))?.balance).toBeUndefined();
    expect((await repos.ledger.listForPlayer(playerId)).items).toHaveLength(1);
    expect(await repos.ledger.getByIdempotencyKey('fresh')).toBeNull();
  });

  it('allows a negative balance', async () => {
    await post({ kind: 'fine', amount: -250, idempotencyKey: 'fine-1' });
    expect(await balance()).toBe(-250);
    expect((await repos.ledger.getByIdempotencyKey('fine-1'))?.balanceAfter).toBe(-250);
  });

  it('applies several postings for one player in staging order', async () => {
    await repos.runInTransaction(async (tx) => {
      tx.postLedgerEntry({ playerId, kind: 'perMatchPay', amount: 40, idempotencyKey: 'pay' });
      tx.postLedgerEntry({ playerId, kind: 'winBonus', amount: 25, idempotencyKey: 'win' });
    });
    expect(await balance()).toBe(65);
    expect((await repos.ledger.getByIdempotencyKey('pay'))?.balanceAfter).toBe(40);
    expect((await repos.ledger.getByIdempotencyKey('win'))?.balanceAfter).toBe(65);
  });

  it('writes nothing when another part of the unit of work fails', async () => {
    await expect(repos.runInTransaction(async (tx) => {
      tx.postLedgerEntry({ playerId, kind: 'salary', amount: 500, idempotencyKey: 'salary-1' });
      tx.updatePlayer('someone-else', { name: 'X' }, { disciplineVersion: 1 });
    })).rejects.toBeInstanceOf(ConcurrencyError);
    expect(await balance()).toBeUndefined();
    expect(await repos.ledger.getByIdempotencyKey('salary-1')).toBeNull();
  });

  it('refuses a posting for a player the unit of work also writes another way', async () => {
    await expect(repos.runInTransaction(async (tx) => {
      tx.incrementPlayerRecord(playerId, { wins: 1 });
      tx.postLedgerEntry({ playerId, kind: 'winBonus', amount: 10, idempotencyKey: 'clash' });
    })).rejects.toBeInstanceOf(InvalidLedgerPostingError);
    expect((await repos.roster.players.findById(playerId))?.wins).toBe(0);
  });

  it('refuses a missing or deleted player', async () => {
    await expect(post({ playerId: 'nobody' })).rejects.toBeInstanceOf(NotFoundError);
    await repos.roster.players.delete(playerId);
    await expect(post()).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each([0, 1.5, Number.NaN])('refuses amount %s at staging time', async (amount) => {
    await expect(post({ amount })).rejects.toBeInstanceOf(InvalidLedgerPostingError);
  });

  it('refuses an empty key and a key staged twice', async () => {
    await expect(post({ idempotencyKey: ' ' })).rejects.toBeInstanceOf(InvalidLedgerPostingError);
    await expect(repos.runInTransaction(async (tx) => {
      tx.postLedgerEntry({ playerId, kind: 'refund', amount: 5, idempotencyKey: 'twice' });
      tx.postLedgerEntry({ playerId, kind: 'refund', amount: 5, idempotencyKey: 'twice' });
    })).rejects.toBeInstanceOf(InvalidLedgerPostingError);
  });
});

describe('listForPlayer', () => {
  it('pages newest first and only returns that player', async () => {
    const otherId = (await repos.roster.players.create({ name: 'Austin', currentWrestler: 'Stone Cold' })).playerId;
    vi.useFakeTimers({ toFake: ['Date'] });
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(Date.parse('2026-01-01T00:00:00.000Z') + i * 1000);
      await post({ amount: i + 1, idempotencyKey: `k${i}` });
    }
    await post({ playerId: otherId, idempotencyKey: 'other' });
    vi.useRealTimers();

    const first = await repos.ledger.listForPlayer(playerId, undefined, 2);
    expect(first.items.map((entry) => entry.idempotencyKey)).toEqual(['k4', 'k3']);
    const second = await repos.ledger.listForPlayer(playerId, first.nextCursor, 2);
    expect(second.items.map((entry) => entry.idempotencyKey)).toEqual(['k2', 'k1']);
    const last = await repos.ledger.listForPlayer(playerId, second.nextCursor, 2);
    expect(last.items.map((entry) => entry.idempotencyKey)).toEqual(['k0']);
    expect(last.nextCursor).toBeUndefined();
  });

  it('rejects a malformed cursor', async () => {
    await expect(repos.ledger.listForPlayer(playerId, 'not-a-cursor')).rejects.toThrow('Invalid pagination cursor');
  });
});
