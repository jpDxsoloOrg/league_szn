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
const { mockCreateNotification, mockCreateNotifications, mockListStaffUserIds } = vi.hoisted(() => ({
  mockCreateNotification: vi.fn(),
  mockCreateNotifications: vi.fn(),
  mockListStaffUserIds: vi.fn(),
}));
vi.mock('../../../lib/notifications', () => ({
  createNotification: mockCreateNotification,
  createNotifications: mockCreateNotifications,
}));
vi.mock('../../../lib/staffUsers', () => ({ listStaffUserIds: mockListStaffUserIds }));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Contract,
  type Repositories,
} from '../../../lib/repositories';
import { DEFAULT_ECONOMY_SETTINGS } from '../../../lib/policies/economyDefaults';
import { handler as contractsRouter } from '../handler';
import { handler as expireOffers } from '../expireOffers';
import { bearer, call, makeEvent } from '../../__tests__/visibilityTestHelpers';

const GM = bearer('gm-sub', 'Moderator');
const PLAYER = bearer('player-sub', 'Wrestler');
const OTHER = bearer('other-sub', 'Wrestler');
const UNVERIFIED = { headers: { Authorization: 'Bearer invalid' } };

let repos: Repositories;
let playerId: string;

type Body = Record<string, unknown> & { message?: string };

function request(
  method: string,
  resource: string,
  path: string,
  auth: Pick<APIGatewayProxyEvent, 'headers'> | null,
  options: { body?: Record<string, unknown>; pathParameters?: Record<string, string>; query?: Record<string, string> } = {},
) {
  return call<Body>(contractsRouter, makeEvent({
    ...(auth ?? {}),
    httpMethod: method,
    resource,
    path,
    pathParameters: options.pathParameters ?? null,
    queryStringParameters: options.query ?? null,
    body: options.body ? JSON.stringify(options.body) : null,
  }));
}

const offer = (body: Record<string, unknown>, auth: Pick<APIGatewayProxyEvent, 'headers'> | null = GM) =>
  request('POST', '/contracts', '/contracts', auth, { body });

const act = (
  action: 'accept' | 'decline' | 'withdraw' | 'release',
  contractId: string,
  auth: Pick<APIGatewayProxyEvent, 'headers'> | null,
  body?: Record<string, unknown>,
) => request('POST', `/contracts/{contractId}/${action}`, `/contracts/${contractId}/${action}`, auth, {
  pathParameters: { contractId },
  body,
});

async function makeOffer(body: Record<string, unknown> = {}): Promise<Contract> {
  const { statusCode, body: created } = await offer({ playerId, type: 'matches', matchesTotal: 5, ...body });
  expect(statusCode).toBe(201);
  return created as unknown as Contract;
}

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  const player = await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock' });
  playerId = player.playerId;
  await repos.roster.players.update(playerId, { userId: 'player-sub' });
  mockCreateNotification.mockReset().mockResolvedValue(undefined);
  mockCreateNotifications.mockReset().mockResolvedValue(undefined);
  mockListStaffUserIds.mockReset().mockResolvedValue(['gm-sub', 'admin-sub']);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('POST /contracts', () => {
  it('fills pay from the economy defaults and notifies the player', async () => {
    const contract = await makeOffer({ type: 'tryout', matchesTotal: undefined });
    const defaults = DEFAULT_ECONOMY_SETTINGS.contractDefaults.tryout;
    expect(contract).toMatchObject({
      playerId,
      type: 'tryout',
      status: 'offered',
      matchesTotal: defaults.matches,
      perMatchPay: defaults.perMatchPay,
      weeklySalary: 0,
      winBonus: defaults.winBonus,
      offeredBy: 'gm-sub',
    });
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'player-sub',
      type: 'contract_offer',
      sourceType: 'contract',
      sourceId: contract.contractId,
    }));
  });

  it('keeps GM overrides', async () => {
    const contract = await makeOffer({ perMatchPay: 400, winBonus: 0 });
    expect(contract.perMatchPay).toBe(400);
    expect(contract.winBonus).toBe(0);
  });

  it('ties a season contract to the active season by default', async () => {
    const season = await repos.season.seasons.create({ name: 'S1', startDate: '2026-01-01' });
    const contract = await makeOffer({ type: 'season', matchesTotal: undefined });
    expect(contract.seasonId).toBe(season.seasonId);
  });

  it('rejects an invalid offer with the policy errors', async () => {
    const { statusCode, body } = await offer({ playerId, type: 'season' });
    expect(statusCode).toBe(400);
    expect(body.errors).toEqual([expect.objectContaining({ code: 'seasonRequired' })]);
  });

  it('refuses a deactivated player', async () => {
    await repos.roster.players.updateDiscipline(playerId, {
      strikes: [],
      deactivations: [],
      deactivatedAt: '2026-11-01T00:00:00.000Z',
    }, 0);
    const { statusCode, body } = await offer({ playerId, type: 'matches', matchesTotal: 3 });
    expect(statusCode).toBe(409);
    expect(body.code).toBe('PLAYER_DEACTIVATED');
  });

  it('is for GMs only', async () => {
    expect((await offer({ playerId, type: 'matches', matchesTotal: 3 }, PLAYER)).statusCode).toBe(403);
    expect((await offer({ playerId, type: 'matches', matchesTotal: 3 }, UNVERIFIED)).statusCode).toBe(401);
    expect((await offer({ playerId, type: 'matches', matchesTotal: 3 }, bearer('admin-sub', 'Admin'))).statusCode).toBe(201);
  });
});

describe('accept and decline', () => {
  it('accepting activates the contract, links it and withdraws the other offers', async () => {
    const first = await makeOffer();
    const second = await makeOffer({ type: 'tryout', matchesTotal: 2 });

    const { statusCode, body } = await act('accept', first.contractId, PLAYER);
    expect(statusCode).toBe(200);
    expect(body.withdrawnOfferIds).toEqual([second.contractId]);
    expect((await repos.contracts.findById(first.contractId))?.status).toBe('active');
    expect((await repos.roster.players.findById(playerId))?.activeContractId).toBe(first.contractId);
    expect(await repos.contracts.findById(second.contractId)).toMatchObject({
      status: 'withdrawn',
      endReason: 'otherOfferAccepted',
    });
    expect(mockCreateNotifications).toHaveBeenCalledWith([
      expect.objectContaining({ userId: 'gm-sub', type: 'contract_offer_accepted' }),
      expect.objectContaining({ userId: 'admin-sub', type: 'contract_offer_accepted' }),
    ]);
  });

  it('answers 409 to a second accept while a contract is active', async () => {
    const first = await makeOffer();
    expect((await act('accept', first.contractId, PLAYER)).statusCode).toBe(200);
    const later = await makeOffer();
    const { statusCode, body } = await act('accept', later.contractId, PLAYER);
    expect(statusCode).toBe(409);
    expect(body.message).toBe('You already have an active contract');
    expect((await repos.contracts.findById(later.contractId))?.status).toBe('offered');
  });

  it('rolls back when the player row already holds a contract (the transaction guard)', async () => {
    const first = await makeOffer();
    expect((await act('accept', first.contractId, PLAYER)).statusCode).toBe(200);
    const later = await makeOffer();
    // Simulate the race: the handler's first read sees a player with no contract.
    const findById = repos.roster.players.findById.bind(repos.roster.players);
    let calls = 0;
    vi.spyOn(repos.roster.players, 'findById').mockImplementation(async (id: string) => {
      const player = await findById(id);
      calls++;
      return calls === 1 && player ? { ...player, activeContractId: undefined } : player;
    });
    const { statusCode, body } = await act('accept', later.contractId, PLAYER);
    expect(statusCode).toBe(409);
    expect(body.message).toBe('You already have an active contract');
    expect((await repos.contracts.findById(later.contractId))?.status).toBe('offered');
    expect((await repos.roster.players.findById(playerId))?.activeContractId).toBe(first.contractId);
  });

  it('will not accept an expired offer, and marks it expired', async () => {
    const contract = await makeOffer();
    const store = (repos.contracts as unknown as { store: Map<string, Contract> }).store;
    store.set(contract.contractId, { ...store.get(contract.contractId)!, offerExpiresAt: '2020-01-01T00:00:00.000Z' });

    const { statusCode, body } = await act('accept', contract.contractId, PLAYER);
    expect(statusCode).toBe(409);
    expect(body.message).toBe('This offer has expired');
    expect((await repos.contracts.findById(contract.contractId))?.status).toBe('expired');
    expect((await repos.roster.players.findById(playerId))?.activeContractId).toBeUndefined();
  });

  it('only the player the offer was made to can answer it', async () => {
    const contract = await makeOffer();
    expect((await act('accept', contract.contractId, OTHER)).statusCode).toBe(403);
    expect((await act('accept', contract.contractId, GM)).statusCode).toBe(403);
    expect((await act('decline', contract.contractId, OTHER)).statusCode).toBe(403);
    expect((await act('accept', contract.contractId, UNVERIFIED)).statusCode).toBe(401);
  });

  it('declining closes the offer and tells the GMs', async () => {
    const contract = await makeOffer();
    const { statusCode, body } = await act('decline', contract.contractId, PLAYER);
    expect(statusCode).toBe(200);
    expect(body).toMatchObject({ status: 'declined', endReason: 'offerDeclined' });
    expect(mockCreateNotifications).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ type: 'contract_offer_declined' }),
    ]));
    expect((await act('accept', contract.contractId, PLAYER)).statusCode).toBe(409);
  });
});

describe('withdraw and release', () => {
  it('a GM withdraws an open offer only', async () => {
    const contract = await makeOffer();
    expect((await act('withdraw', contract.contractId, PLAYER)).statusCode).toBe(403);
    const { statusCode, body } = await act('withdraw', contract.contractId, GM);
    expect(statusCode).toBe(200);
    expect(body).toMatchObject({ status: 'withdrawn', endReason: 'offerWithdrawn' });
    expect((await act('withdraw', contract.contractId, GM)).statusCode).toBe(409);
  });

  it('releasing ends an active contract now and frees the player', async () => {
    const contract = await makeOffer();
    await act('accept', contract.contractId, PLAYER);

    expect((await act('release', contract.contractId, GM, {})).statusCode).toBe(400);
    expect((await act('release', contract.contractId, PLAYER, { note: 'x' })).statusCode).toBe(403);

    const { statusCode, body } = await act('release', contract.contractId, GM, { note: 'Left the league' });
    expect(statusCode).toBe(200);
    expect(body).toMatchObject({ status: 'released', endReason: 'released', note: 'Left the league' });
    expect((await repos.roster.players.findById(playerId))?.activeContractId).toBeUndefined();
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'player-sub',
      type: 'contract_released',
    }));
    expect((await act('release', contract.contractId, GM, { note: 'again' })).statusCode).toBe(409);
  });

  it('an open offer cannot be released', async () => {
    const contract = await makeOffer();
    expect((await act('release', contract.contractId, GM, { note: 'n' })).statusCode).toBe(409);
  });
});

describe('reads', () => {
  it('the public contract view hides money', async () => {
    const contract = await makeOffer({ perMatchPay: 999, weeklySalary: 50, winBonus: 77, note: 'secret' });
    await act('accept', contract.contractId, PLAYER);

    const { statusCode, body } = await request(
      'GET', '/players/{playerId}/contract', `/players/${playerId}/contract`, null,
      { pathParameters: { playerId } },
    );
    expect(statusCode).toBe(200);
    expect(body.freeAgent).toBe(false);
    expect(body.contract).toMatchObject({ type: 'matches', status: 'active', matchesTotal: 5, matchesPlayed: 0 });
    const shown = body.contract as Record<string, unknown>;
    for (const field of ['perMatchPay', 'weeklySalary', 'winBonus', 'note', 'offeredBy']) {
      expect(shown).not.toHaveProperty(field);
    }
  });

  it('a player without a contract shows as a free agent and in the pool', async () => {
    const other = await repos.roster.players.create({ name: 'Mick', currentWrestler: 'Mankind' });
    await repos.roster.players.create({ name: 'Hidden', currentWrestler: 'Needs Wrestler' });
    const contract = await makeOffer();
    await act('accept', contract.contractId, PLAYER);

    const badge = await request(
      'GET', '/players/{playerId}/contract', `/players/${other.playerId}/contract`, null,
      { pathParameters: { playerId: other.playerId } },
    );
    expect(badge.body).toMatchObject({ freeAgent: true, contract: null });

    const pool = await call<Array<{ playerId: string; balance?: number }>>(contractsRouter, makeEvent({
      httpMethod: 'GET', resource: '/free-agents', path: '/free-agents',
    }));
    expect(pool.statusCode).toBe(200);
    expect(pool.body.map((player) => player.playerId)).toEqual([other.playerId]);
  });

  it('GET /players/me/contracts returns the money, offers and history', async () => {
    const accepted = await makeOffer({ perMatchPay: 321 });
    const open = await makeOffer();
    await act('accept', accepted.contractId, PLAYER);
    const fresh = await makeOffer({ type: 'tryout', matchesTotal: 1 });

    const { statusCode, body } = await request('GET', '/players/me/contracts', '/players/me/contracts', PLAYER);
    expect(statusCode).toBe(200);
    expect(body.playerId).toBe(playerId);
    expect(body.balance).toBe(0);
    expect(body.activeContract).toMatchObject({ contractId: accepted.contractId, perMatchPay: 321 });
    expect((body.offers as Contract[]).map((contract) => contract.contractId)).toEqual([fresh.contractId]);
    expect((body.pastContracts as Contract[]).map((contract) => contract.contractId)).toEqual([open.contractId]);
  });

  it('GET /contracts is for GMs and filters by status and player', async () => {
    const contract = await makeOffer();
    await makeOffer();
    await act('accept', contract.contractId, PLAYER);

    expect((await request('GET', '/contracts', '/contracts', PLAYER)).statusCode).toBe(403);
    const active = await call<Contract[]>(contractsRouter, makeEvent({
      ...GM, httpMethod: 'GET', resource: '/contracts', path: '/contracts',
      queryStringParameters: { status: 'active', playerId },
    }));
    expect(active.statusCode).toBe(200);
    expect(active.body.map((row) => row.contractId)).toEqual([contract.contractId]);
    expect((await request('GET', '/contracts', '/contracts', GM, { query: { status: 'bogus' } })).statusCode).toBe(400);
  });
});

describe('expiry sweep', () => {
  it('expires overdue offers only and notifies the player and the offering GM', async () => {
    const overdue = await makeOffer();
    const current = await makeOffer();
    const store = (repos.contracts as unknown as { store: Map<string, Contract> }).store;
    store.set(overdue.contractId, { ...store.get(overdue.contractId)!, offerExpiresAt: '2020-01-01T00:00:00.000Z' });
    mockCreateNotification.mockClear();

    const result = await expireOffers();
    expect(result).toEqual({ open: 2, expired: 1, skipped: 0, failed: 0 });
    expect(await repos.contracts.findById(overdue.contractId)).toMatchObject({
      status: 'expired',
      endReason: 'offerExpired',
    });
    expect((await repos.contracts.findById(current.contractId))?.status).toBe('offered');
    expect(mockCreateNotification.mock.calls.map(([params]) => params.userId).sort())
      .toEqual(['gm-sub', 'player-sub']);
  });
});
