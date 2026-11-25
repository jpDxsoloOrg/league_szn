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
import type { LedgerEntryKind } from '../../../lib/repositories/ledger';
import { handler as playersRouter } from '../handler';
import { handler as getStatistics } from '../../statistics/getStatistics';
import type { MyLedgerResponse } from '../getMyLedger';
import { bearer, call, makeEvent } from '../../__tests__/visibilityTestHelpers';

const PLAYER = bearer('player-sub', 'Wrestler');
const OTHER = bearer('other-sub', 'Wrestler');
const GM = bearer('gm-sub', 'Moderator');

let repos: Repositories;
let playerId: string;

function getLedger(auth: Pick<APIGatewayProxyEvent, 'headers'> | null, query: Record<string, string> | null = null) {
  return call<MyLedgerResponse & { message?: string }>(playersRouter, makeEvent({
    ...(auth ?? {}),
    httpMethod: 'GET',
    resource: '/players/me/ledger',
    path: '/players/me/ledger',
    queryStringParameters: query,
  }));
}

async function post(kind: LedgerEntryKind, amount: number, key: string, note?: string) {
  // One second apart, so entries made in the same millisecond still sort in posting order.
  vi.setSystemTime(Date.now() + 1000);
  await repos.runInTransaction(async (tx) => {
    tx.postLedgerEntry({ playerId, kind, amount, idempotencyKey: key, note, actorUserId: 'gm-sub' });
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  const player = await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock' });
  playerId = player.playerId;
  await repos.roster.players.update(playerId, { userId: 'player-sub' });
  const other = await repos.roster.players.create({ name: 'Austin', currentWrestler: 'Stone Cold' });
  await repos.roster.players.update(other.playerId, { userId: 'other-sub' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('GET /players/me/ledger (ECO-13)', () => {
  it('returns the caller\'s own entries newest first with the balance', async () => {
    await post('perMatchPay', 100, 'k1');
    await post('fine', -30, 'k2', 'Missed the show');

    const { statusCode, body } = await getLedger(PLAYER);

    expect(statusCode).toBe(200);
    expect(body.playerId).toBe(playerId);
    expect(body.balance).toBe(70);
    expect(body.items.map((entry) => entry.kind)).toEqual(['fine', 'perMatchPay']);
    expect(body.items[0]).toMatchObject({ amount: -30, balanceAfter: 70, note: 'Missed the show' });
    expect(body.nextCursor).toBeUndefined();
  });

  it('leaves out the GM id and the idempotency key', async () => {
    await post('gmAdjust', 50, 'secret-key');

    const { body } = await getLedger(PLAYER);

    expect(body.items[0]).not.toHaveProperty('actorUserId');
    expect(body.items[0]).not.toHaveProperty('idempotencyKey');
    expect(JSON.stringify(body)).not.toContain('gm-sub');
  });

  it('pages with the cursor', async () => {
    await post('perMatchPay', 10, 'k1');
    await post('perMatchPay', 20, 'k2');
    await post('perMatchPay', 30, 'k3');

    const first = await getLedger(PLAYER, { limit: '2' });
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await getLedger(PLAYER, { limit: '2', cursor: first.body.nextCursor as string });
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeUndefined();
  });

  it('never shows another player\'s entries', async () => {
    await post('perMatchPay', 100, 'k1');

    const { statusCode, body } = await getLedger(OTHER);

    expect(statusCode).toBe(200);
    expect(body.items).toEqual([]);
    expect(body.balance).toBe(0);
  });

  it('rejects a bad cursor or limit', async () => {
    expect((await getLedger(PLAYER, { cursor: Buffer.from('nope').toString('base64') })).statusCode).toBe(400);
    expect((await getLedger(PLAYER, { limit: '0' })).statusCode).toBe(400);
  });

  it('needs a signed-in user with a player', async () => {
    expect((await getLedger({ headers: { Authorization: 'Bearer invalid' } })).statusCode).toBe(401);
    expect((await getLedger(GM)).statusCode).toBe(404);
  });
});

describe('money stays off other users\' views (ECO-13)', () => {
  const PRIVATE_FIELDS = ['balance', 'effects', 'activeContractId'];

  beforeEach(async () => {
    await post('perMatchPay', 1334, 'k1');
    await repos.runInTransaction(async (tx) => {
      tx.postLedgerEntry({
        playerId,
        kind: 'purchase',
        amount: -100,
        idempotencyKey: 'shop-1',
        appendPlayerEffects: [{
          effectId: 'e1', purchasedAt: '2026-11-24T00:00:00.000Z', purchaseKey: 'shop-1', kind: 'staminaTopUp', amount: 20,
        }],
      });
    });
    await repos.runInTransaction(async (tx) => {
      tx.setPlayerActiveContract(playerId, 'contract-1');
    });
  });

  function expectNoPrivateFields(value: unknown) {
    const json = JSON.stringify(value);
    for (const field of PRIVATE_FIELDS) expect(json).not.toContain(`"${field}"`);
    expect(json).not.toContain('1234');
  }

  const listPlayers = (auth: Pick<APIGatewayProxyEvent, 'headers'> | null) => call(playersRouter, makeEvent({
    ...(auth ?? {}), httpMethod: 'GET', resource: '/players', path: '/players',
  }));
  const getPlayer = (auth: Pick<APIGatewayProxyEvent, 'headers'> | null) => call(playersRouter, makeEvent({
    ...(auth ?? {}),
    httpMethod: 'GET',
    resource: '/players/{playerId}',
    path: `/players/${playerId}`,
    pathParameters: { playerId },
  }));

  it.each([
    ['an anonymous caller', null],
    ['another wrestler', OTHER],
  ])('GET /players and GET /players/{id} hide them from %s', async (_label, auth) => {
    const list = await listPlayers(auth);
    const one = await getPlayer(auth);

    expect(list.statusCode).toBe(200);
    expect(one.statusCode).toBe(200);
    expectNoPrivateFields(list.body);
    expectNoPrivateFields(one.body);
  });

  it('GET /players/{id} still shows the player their own money', async () => {
    const { body } = await getPlayer(PLAYER);

    expect(body).toMatchObject({
      balance: 1234,
      activeContractId: 'contract-1',
      effects: [expect.objectContaining({ effectId: 'e1' })],
    });
  });

  it.each(['leaderboards', 'records', 'player-stats', 'head-to-head', 'achievements'])(
    'GET /statistics?section=%s hides them',
    async (section) => {
      const { statusCode, body } = await call(getStatistics, makeEvent({
        httpMethod: 'GET',
        resource: '/statistics',
        path: '/statistics',
        queryStringParameters: { section, playerId, player1Id: playerId },
      }));

      expect(statusCode).toBe(200);
      expectNoPrivateFields(body);
    },
  );
});
