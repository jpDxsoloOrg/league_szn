import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});
vi.mock('../../../lib/authenticate', async () => {
  const { fakeAuthenticate } = await import('../../__tests__/visibilityTestHelpers');
  return { authenticate: fakeAuthenticate };
});

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as playersRouter } from '../../players/handler';
import { bearer, call, makeEvent } from '../../__tests__/visibilityTestHelpers';
import type { PlayerLedgerResult } from '../getPlayerLedger';

let repos: Repositories;
let playerId: string;

const readLedger = (
  query: Record<string, string> | null = null,
  auth: Pick<APIGatewayProxyEvent, 'headers'> = bearer('mod-sub', 'Moderator'),
  id: string = playerId,
) =>
  call<PlayerLedgerResult & { message?: string }>(playersRouter, makeEvent({
    ...auth,
    httpMethod: 'GET',
    resource: '/players/{playerId}/ledger',
    path: `/players/${id}/ledger`,
    pathParameters: { playerId: id },
    queryStringParameters: query,
  }));

let clock = Date.parse('2026-11-01T00:00:00Z');

/** Each posting a second after the last, so the newest-first order is fixed. */
const post = (amount: number, key: string) => {
  clock += 1000;
  vi.setSystemTime(clock);
  return repos.runInTransaction(async (tx) => {
    tx.postLedgerEntry({ playerId, kind: amount < 0 ? 'fine' : 'gmAdjust', amount, idempotencyKey: key, note: key });
  });
};

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  playerId = (await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock' })).playerId;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('GET /players/{playerId}/ledger', () => {
  it('returns the entries newest first with the balance', async () => {
    await post(100, 'first');
    await post(-30, 'second');
    const { statusCode, body } = await readLedger();
    expect(statusCode).toBe(200);
    expect(body.balance).toBe(70);
    expect(body.items.map((entry) => entry.note)).toEqual(['second', 'first']);
  });

  it('pages with limit and cursor', async () => {
    await post(10, 'a');
    await post(10, 'b');
    await post(10, 'c');
    const first = await readLedger({ limit: '2' });
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await readLedger({ limit: '2', cursor: first.body.nextCursor as string });
    expect(second.body.items.map((entry) => entry.note)).toEqual(['a']);
  });

  it('refuses a bad limit', async () => {
    expect((await readLedger({ limit: '0' })).statusCode).toBe(400);
  });

  it('404s for an unknown player', async () => {
    expect((await readLedger(null, bearer('mod-sub', 'Moderator'), 'missing')).statusCode).toBe(404);
  });

  it('is closed to wrestlers', async () => {
    expect((await readLedger(null, bearer('w-sub', 'Wrestler'))).statusCode).toBe(403);
  });
});
