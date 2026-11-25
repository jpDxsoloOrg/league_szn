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
vi.mock('../../../lib/asyncLambda', () => ({ invokeAsync: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../lib/progression/trigger', () => ({
  triggerProgressionRecompute: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../matches/updateGroupStats', () => ({ updateGroupStats: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../matches/revertGroupStats', () => ({ revertGroupStats: vi.fn().mockResolvedValue(undefined) }));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { DEFAULT_ECONOMY_SETTINGS, toEconomySettingsInput } from '../../../lib/policies/economyDefaults';
import { handler as adminRouter } from '../../admin/handler';
import { handler as recordResult } from '../../matches/recordResult';
import { handler as deleteMatch } from '../../matches/deleteMatch';
import { authedEvent, bearer, call, makeEvent } from '../../__tests__/visibilityTestHelpers';
import type { PurchaseResult } from '../purchase';

type Body = PurchaseResult & { message?: string; code?: string };

let repos: Repositories;
let playerId: string;
let rivalId: string;
let outsiderId: string;

const BUYER_SUB = 'buyer-sub';

const buy = (body: Record<string, unknown>, auth: Pick<APIGatewayProxyEvent, 'headers'> = bearer(BUYER_SUB, 'Wrestler')) =>
  call<Body>(adminRouter, makeEvent({
    ...auth,
    httpMethod: 'POST',
    resource: '/shop/purchase',
    path: '/shop/purchase',
    body: JSON.stringify(body),
  }));

async function fund(targetId: string, amount: number): Promise<void> {
  await repos.runInTransaction(async (tx) => {
    tx.postLedgerEntry({
      playerId: targetId,
      kind: 'gmAdjust',
      amount,
      idempotencyKey: `test#${targetId}#${Math.random()}`,
    });
  });
}

async function scheduleMatch(participants: string[]): Promise<string> {
  const match = await repos.competition.matches.create({
    matchId: `match-${Math.random().toString(36).slice(2)}`,
    createdAt: '2026-11-24T00:00:00.000Z',
    date: '2026-12-01T00:00:00.000Z',
    matchFormat: 'singles',
    participants,
    isChampionship: false,
    status: 'scheduled',
  });
  return match.matchId;
}

const balanceOf = async (id: string) => (await repos.roster.players.findById(id))?.balance ?? 0;

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  await repos.user.siteConfig.updateFeatures({ economy: true });
  playerId = (await repos.roster.players.create({ name: 'Buyer', currentWrestler: 'The Rock' })).playerId;
  await repos.roster.players.update(playerId, { userId: BUYER_SUB });
  rivalId = (await repos.roster.players.create({ name: 'Rival', currentWrestler: 'Mankind' })).playerId;
  outsiderId = (await repos.roster.players.create({ name: 'Outsider', currentWrestler: 'Edge' })).playerId;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

const { shop } = DEFAULT_ECONOMY_SETTINGS;

describe('POST /shop/purchase', () => {
  it('buys an injury shield: charges the price and stores the effect on the player', async () => {
    await fund(playerId, 1000);
    const { statusCode, body } = await buy({ item: 'injuryShield' });
    expect(statusCode).toBe(201);
    expect(body.balance).toBe(1000 - shop.injuryShield.price);
    expect(body.entry).toMatchObject({ playerId, kind: 'purchase', amount: -shop.injuryShield.price, refType: 'shop', refId: 'injuryShield' });
    expect(body.effect).toMatchObject({
      kind: 'injuryShield',
      reduction: shop.injuryShield.chanceReduction,
      matchesLeft: shop.injuryShield.matches,
      purchaseKey: body.entry.idempotencyKey,
    });
    const stored = await repos.roster.players.findById(playerId);
    expect(stored?.effects).toEqual([body.effect]);
    expect(stored?.balance).toBe(1000 - shop.injuryShield.price);
  });

  it('refuses a second shield while the first is active (409)', async () => {
    await fund(playerId, 1000);
    expect((await buy({ item: 'injuryShield' })).statusCode).toBe(201);
    const { statusCode, body } = await buy({ item: 'injuryShield' });
    expect(statusCode).toBe(409);
    expect(body.code).toBe('SHIELD_ACTIVE');
    expect(await balanceOf(playerId)).toBe(1000 - shop.injuryShield.price);
  });

  it('records a pending stamina top-up', async () => {
    await fund(playerId, 500);
    const { statusCode, body } = await buy({ item: 'staminaTopUp' });
    expect(statusCode).toBe(201);
    expect(body.effect).toMatchObject({ kind: 'staminaTopUp', amount: shop.staminaTopUp.amount });
  });

  it('refuses rehab without an active injury (409) and charges nothing', async () => {
    await fund(playerId, 1000);
    const { statusCode, body } = await buy({ item: 'rehab' });
    expect(statusCode).toBe(409);
    expect(body.code).toBe('NO_ACTIVE_INJURY');
    expect(await balanceOf(playerId)).toBe(1000);
  });

  it('refuses when the balance does not cover the price (409)', async () => {
    await fund(playerId, shop.injuryShield.price - 1);
    const { statusCode, body } = await buy({ item: 'injuryShield' });
    expect(statusCode).toBe(409);
    expect(body.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('refuses a player with no money at all (409)', async () => {
    const { statusCode, body } = await buy({ item: 'staminaTopUp' });
    expect(statusCode).toBe(409);
    expect(body.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('locks the shop while the player is in debt (409)', async () => {
    await fund(playerId, -50);
    const { statusCode, body } = await buy({ item: 'staminaTopUp' });
    expect(statusCode).toBe(409);
    expect(body.code).toBe('IN_DEBT');
  });

  it('refuses a disabled item (409)', async () => {
    await fund(playerId, 1000);
    const input = toEconomySettingsInput(await repos.user.siteConfig.getEconomySettings());
    input.shop.staminaTopUp.enabled = false;
    await repos.user.siteConfig.saveEconomySettings(input, 'admin');
    const { statusCode, body } = await buy({ item: 'staminaTopUp' });
    expect(statusCode).toBe(409);
    expect(body.code).toBe('ITEM_DISABLED');
  });

  it('charges a resent requestId only once', async () => {
    await fund(playerId, 1000);
    const first = await buy({ item: 'staminaTopUp', requestId: 'req-1' });
    const second = await buy({ item: 'staminaTopUp', requestId: 'req-1' });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.body.alreadyApplied).toBe(true);
    expect(second.body.entry.entryId).toBe(first.body.entry.entryId);
    expect(await balanceOf(playerId)).toBe(1000 - shop.staminaTopUp.price);
    expect((await repos.roster.players.findById(playerId))?.effects).toHaveLength(1);
  });

  it('is 403 while the economy feature is off', async () => {
    await repos.user.siteConfig.updateFeatures({ economy: false });
    expect((await buy({ item: 'staminaTopUp' })).statusCode).toBe(403);
  });

  it('sends GM interference to its own route and rejects unknown items (400)', async () => {
    expect((await buy({ item: 'gmInterference' })).statusCode).toBe(400);
    expect((await buy({ item: 'goldBelt' })).statusCode).toBe(400);
    expect((await buy({ item: 'staminaTopUp', target: 'm1' })).statusCode).toBe(400);
  });

  it('refuses a caller with no player profile (404)', async () => {
    expect((await buy({ item: 'staminaTopUp' }, bearer('stranger-sub', 'Wrestler'))).statusCode).toBe(404);
  });

  describe('simInterference', () => {
    it('stores the boost on a scheduled match the buyer is in', async () => {
      await fund(playerId, 1000);
      const matchId = await scheduleMatch([playerId, rivalId]);
      const { statusCode, body } = await buy({ item: 'simInterference', target: matchId });
      expect(statusCode).toBe(201);
      expect(body.entry).toMatchObject({ amount: -shop.simInterference.price, refType: 'match', refId: matchId });
      expect(body.simBoost).toMatchObject({ matchId, playerId, boost: shop.simInterference.ratingBoost });
      const match = await repos.competition.matches.findById(matchId);
      expect(match?.simBoosts).toEqual([expect.objectContaining({ playerId, boost: shop.simInterference.ratingBoost })]);
      expect((await repos.roster.players.findById(playerId))?.effects).toBeUndefined();
    });

    it('needs a target', async () => {
      await fund(playerId, 1000);
      expect((await buy({ item: 'simInterference' })).statusCode).toBe(400);
    });

    it("refuses a boost on someone else's match (409)", async () => {
      await fund(playerId, 1000);
      const matchId = await scheduleMatch([rivalId, outsiderId]);
      const { statusCode, body } = await buy({ item: 'simInterference', target: matchId });
      expect(statusCode).toBe(409);
      expect(body.code).toBe('NOT_IN_MATCH');
      expect(await balanceOf(playerId)).toBe(1000);
    });

    it('refuses a second boost on the same match (409)', async () => {
      await fund(playerId, 1000);
      const matchId = await scheduleMatch([playerId, rivalId]);
      expect((await buy({ item: 'simInterference', target: matchId })).statusCode).toBe(201);
      const { statusCode, body } = await buy({ item: 'simInterference', target: matchId });
      expect(statusCode).toBe(409);
      expect(body.code).toBe('BOOST_ALREADY_BOUGHT');
      expect(await balanceOf(playerId)).toBe(1000 - shop.simInterference.price);
    });

    it('refuses a completed match (409) and a missing one (404)', async () => {
      await fund(playerId, 1000);
      const matchId = await scheduleMatch([playerId, rivalId]);
      const match = await repos.competition.matches.findByIdWithDate(matchId);
      await repos.competition.matches.update(matchId, match!.date, { status: 'completed' });
      expect((await buy({ item: 'simInterference', target: matchId })).body.code).toBe('MATCH_NOT_SCHEDULED');
      expect((await buy({ item: 'simInterference', target: 'nope' })).statusCode).toBe(404);
    });

    it('refunds the boost when the result is recorded by hand', async () => {
      await fund(playerId, 1000);
      await fund(rivalId, 1000);
      const matchId = await scheduleMatch([playerId, rivalId]);
      expect((await buy({ item: 'simInterference', target: matchId })).statusCode).toBe(201);
      expect(await balanceOf(playerId)).toBe(1000 - shop.simInterference.price);

      const result = await call<{ message: string }>(recordResult, authedEvent('admin-sub', 'Admin', {
        httpMethod: 'POST',
        pathParameters: { matchId },
        body: JSON.stringify({ winners: [rivalId], losers: [playerId] }),
      }));
      expect(result.statusCode).toBe(200);

      expect(await balanceOf(playerId)).toBe(1000);
      // The winner is a free agent, so match pay (ECO-05) adds the free-agent win bonus.
      expect(await balanceOf(rivalId)).toBe(1000 + DEFAULT_ECONOMY_SETTINGS.freeAgentWinBonus);
      const { items } = await repos.ledger.listForPlayer(playerId);
      expect(items[0]).toMatchObject({ kind: 'refund', amount: shop.simInterference.price, refType: 'match', refId: matchId });
    });

    it('refunds the boost when the scheduled match is deleted', async () => {
      await fund(playerId, 1000);
      const matchId = await scheduleMatch([playerId, rivalId]);
      expect((await buy({ item: 'simInterference', target: matchId })).statusCode).toBe(201);

      const result = await call<{ message: string }>(deleteMatch, authedEvent('admin-sub', 'Admin', {
        httpMethod: 'DELETE',
        pathParameters: { matchId },
      }));
      expect(result.statusCode).toBe(200);
      expect(await balanceOf(playerId)).toBe(1000);
    });
  });
});
