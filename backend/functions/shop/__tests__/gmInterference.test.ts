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
vi.mock('../../../lib/notifications', () => ({
  createNotification: vi.fn(),
  createNotifications: vi.fn(),
}));
vi.mock('../../../lib/staffUsers', () => ({ listStaffUserIds: vi.fn() }));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { DEFAULT_ECONOMY_SETTINGS, toEconomySettingsInput } from '../../../lib/policies/economyDefaults';
import { createNotification, createNotifications } from '../../../lib/notifications';
import { listStaffUserIds } from '../../../lib/staffUsers';
import { handler as adminRouter } from '../../admin/handler';
import { bearer, call, makeEvent } from '../../__tests__/visibilityTestHelpers';
import type { GmInterferenceRequestResult, ResolveGmInterferenceResult, StaffGmInterferenceView } from '../gmInterference';
import type { PlayerGmInterferenceView } from '../../../lib/repositories/gmInterference';

type ErrorBody = { message?: string; code?: string };

let repos: Repositories;
let playerId: string;

const PLAYER_SUB = 'player-sub';
const PRICE = DEFAULT_ECONOMY_SETTINGS.shop.gmInterference.price;

const route = <T>(
  httpMethod: string,
  path: string,
  auth: Pick<APIGatewayProxyEvent, 'headers'>,
  extra: Partial<APIGatewayProxyEvent> = {},
) => call<T & ErrorBody>(adminRouter, makeEvent({ ...auth, httpMethod, resource: path, path, ...extra }));

const ask = (body: Record<string, unknown>, auth = bearer(PLAYER_SUB, 'Wrestler')) =>
  route<GmInterferenceRequestResult>('POST', '/shop/gm-interference', auth, { body: JSON.stringify(body) });

const resolve = (requestId: string, body: Record<string, unknown>, auth = bearer('admin-sub', 'Admin')) =>
  call<ResolveGmInterferenceResult & ErrorBody>(adminRouter, makeEvent({
    ...auth,
    httpMethod: 'POST',
    resource: '/gm-interference/{requestId}/resolve',
    path: `/gm-interference/${requestId}/resolve`,
    pathParameters: { requestId },
    body: JSON.stringify(body),
  }));

const myRequests = () =>
  route<{ requests: PlayerGmInterferenceView[] }>('GET', '/shop/gm-interference', bearer(PLAYER_SUB, 'Wrestler'));

const queue = (status?: string, auth = bearer('mod-sub', 'Moderator')) =>
  route<{ requests: StaffGmInterferenceView[] }>('GET', '/gm-interference', auth, {
    queryStringParameters: status ? { status } : null,
  });

async function fund(targetId: string, amount: number): Promise<void> {
  await repos.runInTransaction(async (tx) => {
    tx.postLedgerEntry({ playerId: targetId, kind: 'gmAdjust', amount, idempotencyKey: `test#${Math.random()}` });
  });
}

const balanceOf = async (id: string) => (await repos.roster.players.findById(id))?.balance ?? 0;

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  await repos.user.siteConfig.updateFeatures({ economy: true });
  playerId = (await repos.roster.players.create({ name: 'Asker', currentWrestler: 'The Rock' })).playerId;
  await repos.roster.players.update(playerId, { userId: PLAYER_SUB });
  vi.mocked(createNotification).mockReset().mockResolvedValue(undefined);
  vi.mocked(createNotifications).mockReset().mockResolvedValue(undefined);
  vi.mocked(listStaffUserIds).mockReset().mockResolvedValue(['admin-sub', 'mod-sub']);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('POST /shop/gm-interference', () => {
  it('takes the charge up front and creates a pending request', async () => {
    await fund(playerId, 5000);
    const { statusCode, body } = await ask({ request: '  Put me in the title picture  ' });
    expect(statusCode).toBe(201);
    expect(body.balance).toBe(5000 - PRICE);
    expect(body.entry).toMatchObject({ playerId, kind: 'purchase', amount: -PRICE, refType: 'gmInterference' });
    expect(body.request).toMatchObject({ request: 'Put me in the title picture', status: 'pending', price: PRICE });
    expect(await balanceOf(playerId)).toBe(5000 - PRICE);

    const stored = await repos.gmInterference.findById(body.request.requestId);
    expect(stored).toMatchObject({ playerId, status: 'pending', chargeEntryId: body.entry.entryId, sequence: 1 });
  });

  it('notifies every GM except the requester', async () => {
    await fund(playerId, 5000);
    await ask({ request: 'Screw my rival' });
    const sent = vi.mocked(createNotifications).mock.calls[0][0];
    expect(sent.map((notification) => notification.userId).sort()).toEqual(['admin-sub', 'mod-sub']);
    expect(sent[0]).toMatchObject({ type: 'gm_interference_requested', sourceType: 'economy' });
  });

  it('refuses a second request while one is pending (409), without charging', async () => {
    await fund(playerId, 5000);
    expect((await ask({ request: 'First' })).statusCode).toBe(201);
    const { statusCode, body } = await ask({ request: 'Second' });
    expect(statusCode).toBe(409);
    expect(body.code).toBe('REQUEST_PENDING');
    expect(await balanceOf(playerId)).toBe(5000 - PRICE);
  });

  it('allows a new request once the last one is resolved', async () => {
    await fund(playerId, 5000);
    const first = await ask({ request: 'First' });
    expect((await resolve(first.body.request.requestId, { outcome: 'taken' })).statusCode).toBe(200);
    const second = await ask({ request: 'Second' });
    expect(second.statusCode).toBe(201);
    expect((await repos.gmInterference.findById(second.body.request.requestId))?.sequence).toBe(2);
  });

  it('lets only one of two racing requests through', async () => {
    await fund(playerId, 5000);
    const results = await Promise.all([ask({ request: 'A' }), ask({ request: 'B' })]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 409]);
    expect(await balanceOf(playerId)).toBe(5000 - PRICE);
    expect(await repos.gmInterference.listByPlayer(playerId)).toHaveLength(1);
  });

  it('refuses players in debt or short of money (409)', async () => {
    await fund(playerId, PRICE - 1);
    expect((await ask({ request: 'Please' })).body.code).toBe('INSUFFICIENT_FUNDS');
    await fund(playerId, -(PRICE - 1) - 10);
    expect((await ask({ request: 'Please' })).body.code).toBe('IN_DEBT');
    expect(await repos.gmInterference.listByPlayer(playerId)).toHaveLength(0);
  });

  it('refuses when the item is disabled (409) or the economy is off (403)', async () => {
    await fund(playerId, 5000);
    const input = toEconomySettingsInput(DEFAULT_ECONOMY_SETTINGS);
    await repos.user.siteConfig.saveEconomySettings(
      { ...input, shop: { ...input.shop, gmInterference: { enabled: false, price: PRICE } } },
      'admin-sub',
    );
    expect((await ask({ request: 'Please' })).body.code).toBe('ITEM_DISABLED');
    await repos.user.siteConfig.updateFeatures({ economy: false });
    expect((await ask({ request: 'Please' })).statusCode).toBe(403);
  });

  it('validates the request text and the linked match', async () => {
    await fund(playerId, 5000);
    expect((await ask({ request: '' })).statusCode).toBe(400);
    expect((await ask({ request: 'x'.repeat(501) })).statusCode).toBe(400);
    expect((await ask({ request: 'Help', matchId: 'nope' })).statusCode).toBe(404);

    const match = await repos.competition.matches.create({
      matchId: 'match-1',
      createdAt: '2026-11-24T00:00:00.000Z',
      date: '2026-12-01T00:00:00.000Z',
      matchFormat: 'singles',
      participants: [playerId],
      isChampionship: false,
      status: 'scheduled',
    });
    const linked = await ask({ request: 'x'.repeat(500), matchId: match.matchId });
    expect(linked.statusCode).toBe(201);
    expect(linked.body.request.matchId).toBe('match-1');
  });
});

describe('POST /gm-interference/{requestId}/resolve', () => {
  async function pendingRequest(): Promise<string> {
    await fund(playerId, 5000);
    return (await ask({ request: 'Give me the title' })).body.request.requestId;
  }

  it.each(['delivered', 'partial', 'taken'] as const)('keeps the money on %s', async (outcome) => {
    const requestId = await pendingRequest();
    const { statusCode, body } = await resolve(requestId, { outcome });
    expect(statusCode).toBe(200);
    expect(body.request).toMatchObject({ status: outcome, resolvedBy: 'admin-sub' });
    expect(body.refund).toBeUndefined();
    expect(await balanceOf(playerId)).toBe(5000 - PRICE);
  });

  it('gives the money back only on refunded', async () => {
    const requestId = await pendingRequest();
    const { statusCode, body } = await resolve(requestId, { outcome: 'refunded' });
    expect(statusCode).toBe(200);
    expect(body.refund).toMatchObject({ kind: 'refund', amount: PRICE, refType: 'gmInterference', refId: requestId });
    expect(body.request.refundEntryId).toBe(body.refund?.entryId);
    expect(await balanceOf(playerId)).toBe(5000);
  });

  it('resolves once: a second resolve is 409 and never refunds twice', async () => {
    const requestId = await pendingRequest();
    expect((await resolve(requestId, { outcome: 'refunded' })).statusCode).toBe(200);
    const again = await resolve(requestId, { outcome: 'refunded' });
    expect(again.statusCode).toBe(409);
    expect(again.body.code).toBe('ALREADY_RESOLVED');
    expect(await balanceOf(playerId)).toBe(5000);
  });

  it('validates the outcome and 404s an unknown request', async () => {
    const requestId = await pendingRequest();
    expect((await resolve(requestId, { outcome: 'pending' })).statusCode).toBe(400);
    expect((await resolve(requestId, { outcome: 'taken', privateNote: 'x'.repeat(1001) })).statusCode).toBe(400);
    expect((await resolve('missing', { outcome: 'taken' })).statusCode).toBe(404);
  });

  it('is GM only, and a GM cannot resolve their own request', async () => {
    const requestId = await pendingRequest();
    expect((await resolve(requestId, { outcome: 'refunded' }, bearer(PLAYER_SUB, 'Wrestler'))).statusCode).toBe(403);
    const own = await resolve(requestId, { outcome: 'refunded' }, bearer(PLAYER_SUB, 'Wrestler,Moderator'));
    expect(own.statusCode).toBe(409);
    expect(own.body.code).toBe('OWN_REQUEST');
    expect((await resolve(requestId, { outcome: 'taken' }, bearer('mod-sub', 'Moderator'))).statusCode).toBe(200);
  });

  it('notifies the player with the outcome and the public note, never the private note', async () => {
    const requestId = await pendingRequest();
    await resolve(requestId, { outcome: 'taken', publicNote: 'Nice try', privateNote: 'Lol no' });
    const [notification] = vi.mocked(createNotification).mock.calls[0];
    expect(notification).toMatchObject({ userId: PLAYER_SUB, type: 'gm_interference_resolved', sourceId: requestId });
    expect(notification.message).toContain('The GM took your money. Better luck next time.');
    expect(notification.message).toContain('Nice try');
    expect(notification.message).not.toContain('Lol no');
  });
});

describe('reading requests', () => {
  it('shows the player their outcome and public note only', async () => {
    await fund(playerId, 5000);
    const requestId = (await ask({ request: 'Screw my rival' })).body.request.requestId;
    await resolve(requestId, { outcome: 'taken', publicNote: 'Nice try', privateNote: 'Secret GM reason' });

    const { statusCode, body } = await myRequests();
    expect(statusCode).toBe(200);
    expect(body.requests).toHaveLength(1);
    const [view] = body.requests;
    expect(view).toMatchObject({
      requestId,
      status: 'taken',
      publicNote: 'Nice try',
      outcomeMessage: 'The GM took your money. Better luck next time.',
    });
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('Secret GM reason');
    expect(raw).not.toContain('privateNote');
    expect(raw).not.toContain('admin-sub');
  });

  it('gives every GM the queue, filterable by status, with player names and private notes', async () => {
    await fund(playerId, 5000);
    const first = (await ask({ request: 'One' })).body.request.requestId;
    await resolve(first, { outcome: 'taken', privateNote: 'GM eyes only' });
    const second = (await ask({ request: 'Two' })).body.request.requestId;

    const pending = await queue('pending');
    expect(pending.statusCode).toBe(200);
    expect(pending.body.requests.map((row) => row.requestId)).toEqual([second]);
    expect(pending.body.requests[0].playerName).toBe('Asker');

    const all = await queue(undefined, bearer('admin-sub', 'Admin'));
    expect(all.body.requests).toHaveLength(2);
    expect(all.body.requests.find((row) => row.requestId === first)?.privateNote).toBe('GM eyes only');

    expect((await queue('bogus')).statusCode).toBe(400);
    expect((await queue('pending', bearer(PLAYER_SUB, 'Wrestler'))).statusCode).toBe(403);
  });
});
