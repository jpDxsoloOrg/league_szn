import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const { createNotification } = vi.hoisted(() => ({ createNotification: vi.fn() }));

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});
vi.mock('../../../lib/authenticate', async () => {
  const { fakeAuthenticate } = await import('../../__tests__/visibilityTestHelpers');
  return { authenticate: fakeAuthenticate };
});
vi.mock('../../../lib/notifications', () => ({ createNotification }));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { DEFAULT_ECONOMY_SETTINGS } from '../../../lib/policies/economyDefaults';
import { handler as playersRouter } from '../../players/handler';
import { bearer, call, makeEvent } from '../../__tests__/visibilityTestHelpers';
import type { FineResult, RescindFineResult } from '../fines';

type Auth = Pick<APIGatewayProxyEvent, 'headers'>;
const GM: Auth = bearer('gm-sub', 'Moderator');

let repos: Repositories;
let playerId: string;

const fine = (body: Record<string, unknown>, auth: Auth = GM) =>
  call<FineResult & { message?: string }>(playersRouter, makeEvent({
    ...auth,
    httpMethod: 'POST',
    resource: '/players/{playerId}/fines',
    path: `/players/${playerId}/fines`,
    pathParameters: { playerId },
    body: JSON.stringify(body),
  }));

const rescind = (entryId: string, body: Record<string, unknown> = {}, auth: Auth = GM) =>
  call<RescindFineResult & { message?: string }>(playersRouter, makeEvent({
    ...auth,
    httpMethod: 'POST',
    resource: '/fines/{entryId}/rescind',
    path: `/fines/${entryId}/rescind`,
    pathParameters: { entryId },
    body: JSON.stringify(body),
  }));

const balance = async () => (await repos.roster.players.findById(playerId))?.balance ?? 0;

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  playerId = (await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock' })).playerId;
  await repos.roster.players.update(playerId, { userId: 'rock-sub' });
  createNotification.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('POST /players/{playerId}/fines', () => {
  it('takes a preset amount from the economy settings', async () => {
    await repos.user.siteConfig.saveEconomySettings({
      ...DEFAULT_ECONOMY_SETTINGS,
      finePresets: [{ key: 'cheese', label: 'Cheesy move spam', amount: 175 }],
    }, 'admin');

    const { statusCode, body } = await fine({ presetKey: 'cheese' });

    expect(statusCode).toBe(201);
    expect(body.entry).toMatchObject({
      kind: 'fine', amount: -175, balanceAfter: -175, note: 'Cheesy move spam', actorUserId: 'gm-sub',
    });
    expect(await balance()).toBe(-175);
  });

  it('adds the reason to a preset fine', async () => {
    const preset = DEFAULT_ECONOMY_SETTINGS.finePresets[0];
    const { body } = await fine({ presetKey: preset.key, reason: 'Five spears in a row' });
    expect(body.entry.note).toBe(`${preset.label}: Five spears in a row`);
  });

  it('posts a custom amount with its reason and links the match', async () => {
    const match = await repos.competition.matches.create({
      matchId: 'm-1', date: '2026-11-20T00:00:00.000Z', participants: [playerId], status: 'completed',
    });
    const { statusCode, body } = await fine({ amount: 40, reason: 'Pause abuse', matchId: match.matchId });
    expect(statusCode).toBe(201);
    expect(body.entry).toMatchObject({ amount: -40, note: 'Pause abuse', refType: 'match', refId: match.matchId });
  });

  it('needs a reason for a custom amount', async () => {
    const { statusCode, body } = await fine({ amount: 40 });
    expect(statusCode).toBe(400);
    expect(body.message).toMatch(/reason/);
    expect(await balance()).toBe(0);
  });

  it('allows debt and tells the player the first time the balance goes below zero', async () => {
    const first = await fine({ amount: 30, reason: 'Rope-break abuse' });
    const second = await fine({ amount: 30, reason: 'Rope-break abuse' });

    expect(second.body.balance).toBe(-60);
    const types = createNotification.mock.calls.map(([params]) => params.type);
    expect(types).toEqual(['fine_issued', 'balance_negative', 'fine_issued']);
    expect(createNotification.mock.calls[0][0]).toMatchObject({
      userId: 'rock-sub', sourceId: first.body.entry.entryId,
    });
    expect(createNotification.mock.calls[0][0].message).toContain('Rope-break abuse');
  });

  it('posts a resent requestId once', async () => {
    const first = await fine({ amount: 10, reason: 'x', requestId: 'req-1' });
    const second = await fine({ amount: 10, reason: 'x', requestId: 'req-1' });
    expect(second.statusCode).toBe(200);
    expect(second.body.alreadyApplied).toBe(true);
    expect(second.body.entry.entryId).toBe(first.body.entry.entryId);
    expect(await balance()).toBe(-10);
  });

  it.each([
    [{ presetKey: 'nope' }],
    [{}],
    [{ presetKey: 'pause-abuse', amount: 10, reason: 'x' }],
    [{ amount: 0, reason: 'x' }],
    [{ amount: -5, reason: 'x' }],
    [{ amount: 2.5, reason: 'x' }],
    [{ amount: 10, reason: 'x'.repeat(501) }],
    [{ amount: 10, reason: 'x', matchId: '' }],
  ])('rejects %j', async (body) => {
    const { statusCode } = await fine(body);
    expect(statusCode).toBe(400);
  });

  it('returns 404 for an unknown player or match', async () => {
    expect((await fine({ amount: 10, reason: 'x', matchId: 'missing' })).statusCode).toBe(404);
    playerId = 'nobody';
    expect((await fine({ amount: 10, reason: 'x' })).statusCode).toBe(404);
  });

  it.each([['Wrestler'], ['Fantasy']])('refuses %s with 403', async (role) => {
    const { statusCode } = await fine({ amount: 10, reason: 'x' }, bearer('someone', role));
    expect(statusCode).toBe(403);
    expect(await balance()).toBe(0);
  });

  it('lets an Admin fine', async () => {
    expect((await fine({ amount: 10, reason: 'x' }, bearer('admin', 'Admin'))).statusCode).toBe(201);
  });
});

describe('POST /fines/{entryId}/rescind', () => {
  it('refunds the fine once', async () => {
    const issued = await fine({ amount: 80, reason: 'Pause abuse' });
    const entryId = issued.body.entry.entryId;

    const first = await rescind(entryId, { note: 'Lag, not pause' });
    const second = await rescind(entryId);

    expect(first.statusCode).toBe(201);
    expect(first.body.entry).toMatchObject({
      kind: 'fineRescinded', amount: 80, balanceAfter: 0, refType: 'ledgerEntry', refId: entryId,
      note: 'Lag, not pause',
    });
    expect(first.body.fine.entryId).toBe(entryId);
    expect(second.statusCode).toBe(200);
    expect(second.body.alreadyApplied).toBe(true);
    expect(await balance()).toBe(0);
    expect(createNotification.mock.calls.at(-1)?.[0]).toMatchObject({ type: 'fine_rescinded', userId: 'rock-sub' });
  });

  it('only rescinds fines', async () => {
    await repos.runInTransaction(async (tx) => {
      tx.postLedgerEntry({ playerId, kind: 'gmAdjust', amount: 50, idempotencyKey: 'adj-1' });
    });
    const adjust = await repos.ledger.getByIdempotencyKey('adj-1');
    const { statusCode } = await rescind(adjust!.entryId);
    expect(statusCode).toBe(400);
  });

  it('returns 404 for an unknown entry', async () => {
    expect((await rescind('missing')).statusCode).toBe(404);
  });

  it('refuses a Wrestler with 403', async () => {
    const issued = await fine({ amount: 80, reason: 'x' });
    const { statusCode } = await rescind(issued.body.entry.entryId, {}, bearer('someone', 'Wrestler'));
    expect(statusCode).toBe(403);
    expect(await balance()).toBe(-80);
  });
});
