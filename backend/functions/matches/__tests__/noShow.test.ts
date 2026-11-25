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
import { noShowFineKey } from '../../../lib/fines';
import { handler as matchesRouter } from '../handler';
import { handler as playersRouter } from '../../players/handler';
import { bearer, call, makeEvent } from '../../__tests__/visibilityTestHelpers';
import type { NoShowResult } from '../noShow';

type Auth = Pick<APIGatewayProxyEvent, 'headers'>;
const GM: Auth = bearer('gm-sub', 'Moderator');
const MATCH_ID = 'match-1';
const NO_SHOW_FINE = DEFAULT_ECONOMY_SETTINGS.noShowFine;

let repos: Repositories;
let playerId: string;
let opponentId: string;

const mark = (body: Record<string, unknown>, auth: Auth = GM) =>
  call<NoShowResult & { message?: string }>(matchesRouter, makeEvent({
    ...auth,
    httpMethod: 'POST',
    resource: '/matches/{matchId}/no-show',
    path: `/matches/${MATCH_ID}/no-show`,
    pathParameters: { matchId: MATCH_ID },
    body: JSON.stringify(body),
  }));

const undo = (targetId: string, auth: Auth = GM) =>
  call<NoShowResult & { message?: string }>(matchesRouter, makeEvent({
    ...auth,
    httpMethod: 'DELETE',
    resource: '/matches/{matchId}/no-show/{playerId}',
    path: `/matches/${MATCH_ID}/no-show/${targetId}`,
    pathParameters: { matchId: MATCH_ID, playerId: targetId },
  }));

const balance = async () => (await repos.roster.players.findById(playerId))?.balance ?? 0;
const storedMatch = async () => repos.competition.matches.findById(MATCH_ID);

async function createMatch(fields: Record<string, unknown> = {}) {
  await repos.competition.matches.create({
    matchId: MATCH_ID,
    date: '2026-11-30T20:00:00.000Z',
    participants: [playerId, opponentId],
    status: 'scheduled',
    ...fields,
  });
}

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  playerId = (await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock' })).playerId;
  await repos.roster.players.update(playerId, { userId: 'rock-sub' });
  opponentId = (await repos.roster.players.create({ name: 'Austin', currentWrestler: 'Stone Cold' })).playerId;
  createNotification.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('POST /matches/{matchId}/no-show', () => {
  it('flags the player, fines the noShowFine and leaves the match scheduled', async () => {
    await createMatch();

    const { statusCode, body } = await mark({ playerId, note: 'Never joined the lobby' });

    expect(statusCode).toBe(201);
    expect(body.alreadyApplied).toBe(false);
    expect(body.entry).toMatchObject({
      kind: 'fine',
      amount: -NO_SHOW_FINE,
      refType: 'match',
      refId: MATCH_ID,
      note: 'No-show: Never joined the lobby',
      idempotencyKey: `match#${MATCH_ID}#noshow#${playerId}`,
      actorUserId: 'gm-sub',
    });
    expect(body.balance).toBe(-NO_SHOW_FINE);
    const match = await storedMatch();
    expect(match?.status).toBe('scheduled');
    expect(match?.noShows).toEqual([{ playerId, markedAt: expect.any(String) }]);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'rock-sub', type: 'no_show_marked', sourceId: MATCH_ID, sourceType: 'match',
    }));
    // The fine took a zero balance below zero.
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'balance_negative' }));
  });

  it('fines once when marked twice', async () => {
    await createMatch();
    const first = await mark({ playerId });
    const second = await mark({ playerId });

    expect(second.statusCode).toBe(200);
    expect(second.body.alreadyApplied).toBe(true);
    expect(second.body.entry?.entryId).toBe(first.body.entry?.entryId);
    expect(await balance()).toBe(-NO_SHOW_FINE);
    expect((await repos.ledger.listForPlayer(playerId)).items).toHaveLength(1);
    expect((await storedMatch())?.noShows).toHaveLength(1);
  });

  it('uses the noShowFine from the economy settings', async () => {
    await repos.user.siteConfig.saveEconomySettings({ ...DEFAULT_ECONOMY_SETTINGS, noShowFine: 75 }, 'admin');
    await createMatch();
    const { body } = await mark({ playerId });
    expect(body.entry?.amount).toBe(-75);
  });

  it('flags without posting when the no-show fine is zero', async () => {
    await repos.user.siteConfig.saveEconomySettings({ ...DEFAULT_ECONOMY_SETTINGS, noShowFine: 0 }, 'admin');
    await createMatch();
    const { statusCode, body } = await mark({ playerId });
    expect(statusCode).toBe(201);
    expect(body.entry).toBeNull();
    expect((await repos.ledger.listForPlayer(playerId)).items).toHaveLength(0);
    expect((await storedMatch())?.noShows).toHaveLength(1);
  });

  it('allows a just-completed match but not an old one', async () => {
    await createMatch({ status: 'completed', completedAt: new Date().toISOString() });
    expect((await mark({ playerId })).statusCode).toBe(201);

    await repos.competition.matches.update(MATCH_ID, '2026-11-30T20:00:00.000Z', {
      noShows: [],
      completedAt: '2026-01-01T00:00:00.000Z',
    });
    expect((await mark({ playerId: opponentId })).statusCode).toBe(409);
  });

  it('refuses a cancelled match', async () => {
    await createMatch({ status: 'cancelled' });
    expect((await mark({ playerId })).statusCode).toBe(409);
  });

  it('refuses a player who is not in the match', async () => {
    await createMatch();
    expect((await mark({ playerId: 'someone-else' })).statusCode).toBe(400);
  });

  it('returns 404 for an unknown match', async () => {
    expect((await mark({ playerId })).statusCode).toBe(404);
  });

  it.each([['Wrestler'], ['Fantasy']])('refuses %s with 403', async (role) => {
    await createMatch();
    expect((await mark({ playerId }, bearer('someone', role))).statusCode).toBe(403);
    expect(await balance()).toBe(0);
  });
});

describe('DELETE /matches/{matchId}/no-show/{playerId}', () => {
  it('clears the flag and refunds the fine', async () => {
    await createMatch();
    const marked = await mark({ playerId });

    const { statusCode, body } = await undo(playerId);

    expect(statusCode).toBe(200);
    expect(body.entry).toMatchObject({
      kind: 'fineRescinded', amount: NO_SHOW_FINE, refType: 'ledgerEntry', refId: marked.body.entry?.entryId,
    });
    expect(body.balance).toBe(0);
    expect((await storedMatch())?.noShows?.[0].undoneAt).toEqual(expect.any(String));
    expect(createNotification).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'fine_rescinded' }));
  });

  it('fines again on a fresh key when re-marked after an undo', async () => {
    await createMatch();
    await mark({ playerId });
    await undo(playerId);

    const remarked = await mark({ playerId });

    expect(remarked.statusCode).toBe(201);
    expect(remarked.body.entry?.idempotencyKey).toBe(noShowFineKey(MATCH_ID, playerId, 2));
    expect(await balance()).toBe(-NO_SHOW_FINE);

    await undo(playerId);
    expect(await balance()).toBe(0);
  });

  it('does not refund twice when the fine was already rescinded', async () => {
    await createMatch();
    const marked = await mark({ playerId });
    const rescinded = await call(playersRouter, makeEvent({
      ...GM,
      httpMethod: 'POST',
      resource: '/fines/{entryId}/rescind',
      path: `/fines/${marked.body.entry?.entryId}/rescind`,
      pathParameters: { entryId: marked.body.entry?.entryId ?? '' },
    }));
    expect(rescinded.statusCode).toBe(201);

    const { statusCode, body } = await undo(playerId);

    expect(statusCode).toBe(200);
    expect(body.entry).toBeNull();
    expect(await balance()).toBe(0);
    expect((await storedMatch())?.noShows?.[0].undoneAt).toBeDefined();
  });

  it('returns 404 when the player is not marked', async () => {
    await createMatch();
    expect((await undo(playerId)).statusCode).toBe(404);
  });

  it('refuses a Wrestler with 403', async () => {
    await createMatch();
    await mark({ playerId });
    expect((await undo(playerId, bearer('someone', 'Wrestler'))).statusCode).toBe(403);
    expect(await balance()).toBe(-NO_SHOW_FINE);
  });
});
