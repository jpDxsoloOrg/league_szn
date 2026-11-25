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
import type { AdjustBalanceResult } from '../adjustBalance';

let repos: Repositories;
let playerId: string;

const adjust = (body: Record<string, unknown>, auth: Pick<APIGatewayProxyEvent, 'headers'> = bearer('admin-sub', 'Admin')) =>
  call<AdjustBalanceResult & { message?: string }>(playersRouter, makeEvent({
    ...auth,
    httpMethod: 'POST',
    resource: '/players/{playerId}/ledger/adjust',
    path: `/players/${playerId}/ledger/adjust`,
    pathParameters: { playerId },
    body: JSON.stringify(body),
  }));

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  playerId = (await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock' })).playerId;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('POST /players/{playerId}/ledger/adjust', () => {
  it('posts a gmAdjust entry and updates the balance', async () => {
    const { statusCode, body } = await adjust({ amount: 150, note: 'Opening balance' });
    expect(statusCode).toBe(201);
    expect(body.alreadyApplied).toBe(false);
    expect(body.balance).toBe(150);
    expect(body.entry).toMatchObject({
      playerId,
      kind: 'gmAdjust',
      amount: 150,
      balanceAfter: 150,
      note: 'Opening balance',
      actorUserId: 'admin-sub',
    });
    expect((await repos.roster.players.findById(playerId))?.balance).toBe(150);
  });

  it('allows a correction that takes the balance negative', async () => {
    await adjust({ amount: 20, note: 'a' });
    const { statusCode, body } = await adjust({ amount: -50, note: 'Overpaid' });
    expect(statusCode).toBe(201);
    expect(body.balance).toBe(-30);
  });

  it('posts a resent requestId once', async () => {
    const first = await adjust({ amount: 10, note: 'Fix', requestId: 'req-1' });
    const second = await adjust({ amount: 10, note: 'Fix', requestId: 'req-1' });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.body.alreadyApplied).toBe(true);
    expect(second.body.entry.entryId).toBe(first.body.entry.entryId);
    expect(second.body.balance).toBe(10);
    expect((await repos.ledger.listForPlayer(playerId)).items).toHaveLength(1);
  });

  it.each([
    ['Moderator'],
    ['Wrestler'],
  ])('refuses %s', async (role) => {
    const { statusCode } = await adjust({ amount: 10, note: 'x' }, bearer('someone', role));
    expect(statusCode).toBe(403);
    expect((await repos.ledger.listForPlayer(playerId)).items).toHaveLength(0);
  });

  it.each([
    [{ amount: 0, note: 'x' }],
    [{ amount: 2.5, note: 'x' }],
    [{ amount: '10', note: 'x' }],
    [{ amount: 10 }],
    [{ amount: 10, note: '   ' }],
    [{ amount: 10, note: 'x'.repeat(501) }],
    [{ amount: 10, note: 'x', requestId: '' }],
  ])('rejects %j', async (body) => {
    const { statusCode } = await adjust(body);
    expect(statusCode).toBe(400);
  });

  it('returns 404 for an unknown player', async () => {
    playerId = 'nobody';
    const { statusCode } = await adjust({ amount: 10, note: 'x' });
    expect(statusCode).toBe(404);
  });
});
