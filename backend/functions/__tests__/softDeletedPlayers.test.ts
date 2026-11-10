import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Callback,
  Context,
  PostConfirmationTriggerEvent,
} from 'aws-lambda';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});
vi.mock('../../lib/authenticate', async () => {
  const { fakeAuthenticate } = await import('./visibilityTestHelpers');
  return { authenticate: fakeAuthenticate };
});
vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: vi.fn().mockResolvedValue({}) })),
  AdminAddUserToGroupCommand: vi.fn(),
}));

import { buildInMemoryRepositories } from '../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../lib/repositories';
import { ConcurrencyError, NotFoundError } from '../../lib/repositories/errors';
import { NEEDS_WRESTLER } from '../../lib/needsWrestler';
import { handler as deletePlayer } from '../players/deletePlayer';
import { handler as getPlayers } from '../players/getPlayers';
import { handler as getPlayer } from '../players/getPlayer';
import { handler as getMyProfile } from '../players/getMyProfile';
import { handler as getBookingSummary } from '../players/getBookingSummary';
import { findWrestlerHolders } from '../players/wrestlerAssignment';
import { handler as getStandings } from '../standings/getStandings';
import { handler as getStatistics } from '../statistics/getStatistics';
import { handler as deleteDivision } from '../divisions/deleteDivision';
import { handler as getCheckIns } from '../events/getCheckIns';
import { handler as getEvent } from '../events/getEvent';
import { handler as getMatches } from '../matches/getMatches';
import { handler as getPromos } from '../promos/getPromos';
import { handler as getPromo } from '../promos/getPromo';
import { handler as getActivity } from '../activity/getActivity';
import { handler as getDashboard } from '../dashboard/getDashboard';
import { handler as getSeasonAwards } from '../seasonAwards/getSeasonAwards';
import { handler as postConfirmation } from '../auth/postConfirmation';
import { authedEvent, bearer, call, makeEvent } from './visibilityTestHelpers';

interface PlayerRow {
  playerId: string;
  name?: string;
  currentWrestler?: string | null;
}

const ids = (rows: PlayerRow[]): string[] => rows.map((row) => row.playerId);
const staffHeaders = bearer('staff-sub', 'Admin');
const DELETED_NAME = 'Gone Person';

let repos: Repositories;
let keptId: string;
let goneId: string;

/** For handlers that may answer 204, which has no JSON body for `call` to parse. */
async function statusOf(handler: APIGatewayProxyHandler, event: APIGatewayProxyEvent): Promise<number> {
  const result = await handler(event, {} as Context, () => {});
  return (result as APIGatewayProxyResult).statusCode;
}

async function softDelete(playerId: string): Promise<number> {
  return statusOf(deletePlayer, makeEvent({ pathParameters: { playerId } }));
}

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  keptId = (await repos.roster.players.create({ name: 'Kept Person', currentWrestler: 'The Rock' })).playerId;
  goneId = (await repos.roster.players.create({
    name: DELETED_NAME,
    currentWrestler: 'Kane',
    psnId: 'gone-psn',
    divisionId: 'd1',
  })).playerId;
  await repos.roster.players.update(goneId, { userId: 'gone-sub' });
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('the row deletePlayer leaves behind', () => {
  it('keeps the name and clears everything that ties it to the league', async () => {
    const { wrestlerId } = await repos.roster.wrestlers.create({ name: 'Kane', promotion: 'WWE', overallCap: 90 });
    await repos.roster.players.update(goneId, {
      currentWrestlerId: wrestlerId,
      alternateWrestler: 'Glenn',
      stableId: 's1',
      tagTeamId: 't1',
    });

    expect(await softDelete(goneId)).toBe(204);

    const row = await repos.roster.players.findByIdWithDeleted(goneId);
    expect(row).toMatchObject({ name: DELETED_NAME, currentWrestler: NEEDS_WRESTLER });
    expect(row?.deletedAt).toEqual(expect.any(String));
    for (const field of [
      'userId', 'currentWrestlerId', 'alternateWrestler', 'alternateWrestlerId', 'stableId', 'tagTeamId', 'psnId',
    ] as const) {
      expect(row).not.toHaveProperty(field);
    }
  });

  it('frees the wrestler for someone else', async () => {
    const { wrestlerId } = await repos.roster.wrestlers.create({ name: 'Kane', promotion: 'WWE', overallCap: 90 });
    await repos.runInTransaction(async (tx) => {
      tx.assignWrestlerToPlayer({ wrestlerId, playerId: goneId, slot: 'primary' });
      tx.updatePlayer(goneId, { currentWrestlerId: wrestlerId });
    });

    await softDelete(goneId);

    const wrestler = await repos.roster.wrestlers.findById(wrestlerId);
    expect(wrestler?.isInUse).toBeFalsy();
    expect(wrestler?.assignedPlayerId).toBeUndefined();
    expect(await findWrestlerHolders(wrestlerId)).toEqual([]);
  });

  it('answers a repeat delete with 404 and leaves the row alone', async () => {
    await softDelete(goneId);
    const first = await repos.roster.players.findByIdWithDeleted(goneId);

    expect(await softDelete(goneId)).toBe(404);

    expect(await repos.roster.players.findByIdWithDeleted(goneId)).toEqual(first);
  });

  it('still blocks deleting a current champion, and changes nothing', async () => {
    await repos.competition.championships.create({ name: 'World', type: 'singles', currentChampion: goneId });

    expect(await softDelete(goneId)).toBe(409);

    expect((await repos.roster.players.findById(goneId))?.userId).toBe('gone-sub');
  });
});

describe('where a deleted player reads as gone', () => {
  beforeEach(async () => {
    await softDelete(goneId);
  });

  it('public player list', async () => {
    const { body } = await call<PlayerRow[]>(getPlayers, makeEvent());
    expect(ids(body)).toEqual([keptId]);
  });

  it('staff includeHidden list', async () => {
    const { body } = await call<PlayerRow[]>(getPlayers, makeEvent({
      ...staffHeaders,
      queryStringParameters: { includeHidden: 'true' },
    }));
    expect(ids(body)).toEqual([keptId]);
  });

  it('GET /players/{id}, for the public and for staff', async () => {
    const pathParameters = { playerId: goneId };
    expect((await call(getPlayer, makeEvent({ pathParameters }))).statusCode).toBe(404);
    expect((await call(getPlayer, makeEvent({ pathParameters, ...staffHeaders }))).statusCode).toBe(404);
  });

  it('the booking picker', async () => {
    const { body } = await call<{ players: PlayerRow[] } | PlayerRow[]>(
      getBookingSummary,
      authedEvent('staff-sub', 'Admin'),
    );
    expect(JSON.stringify(body)).not.toContain(goneId);
  });

  it('the Stats picker', async () => {
    const { body } = await call<{ players: PlayerRow[] }>(
      getStatistics,
      makeEvent({ queryStringParameters: { section: 'player-stats' } }),
    );
    expect(ids(body.players)).toEqual([keptId]);
  });

  it('findByUserId, so the old account has no profile', async () => {
    expect(await repos.roster.players.findByUserId('gone-sub')).toBeNull();
    const { statusCode } = await call(getMyProfile, authedEvent('gone-sub', 'Wrestler'));
    expect(statusCode).toBe(404);
  });

  it('all-time standings', async () => {
    const { body } = await call<{ players: PlayerRow[] }>(getStandings, makeEvent());
    expect(ids(body.players)).toEqual([keptId]);
  });

  it('the staff check-in roster, even with a check-in on file', async () => {
    const { eventId } = await repos.leagueOps.events.create({ name: 'Show', eventType: 'ppv', date: '2026-02-01' });
    await repos.leagueOps.events.upsertCheckIn(eventId, goneId, 'available');

    const { body } = await call<Record<string, PlayerRow[]>>(
      getCheckIns,
      authedEvent('staff-sub', 'Admin', { pathParameters: { eventId } }),
    );

    expect(Object.values(body).flat().map((row) => row.playerId)).toEqual([keptId]);
  });

  it('batches over all players: a deleted member does not hold a division open', async () => {
    const { divisionId } = await repos.leagueOps.divisions.create({ name: 'Young Boys' });
    await repos.runInTransaction(async (tx) => {
      tx.updatePlayer(goneId, { divisionId });
    });

    expect(await statusOf(deleteDivision, makeEvent({ pathParameters: { divisionId } }))).toBe(204);
  });

  it('writes: update reads as missing and a record increment fails the transaction', async () => {
    await expect(repos.roster.players.update(goneId, { name: 'Back' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      repos.runInTransaction(async (tx) => {
        tx.incrementPlayerRecord(goneId, { wins: 1 });
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });
});

describe('where a deleted player keeps their name', () => {
  const date = '2026-01-01T00:00:00.000Z';

  const addResult = async (extra: Record<string, unknown> = {}) => {
    await repos.competition.matches.create({
      matchId: 'm1',
      date,
      matchFormat: 'singles',
      participants: [goneId, keptId],
      winners: [goneId],
      losers: [keptId],
      status: 'completed',
      createdAt: date,
      updatedAt: date,
      ...extra,
    });
  };

  it('view=directory, with no wrestler and no account detail', async () => {
    await softDelete(goneId);

    const { body } = await call<PlayerRow[]>(getPlayers, makeEvent({
      queryStringParameters: { view: 'directory' },
    }));

    expect(body.find((row) => row.playerId === goneId)).toEqual({
      playerId: goneId,
      name: DELETED_NAME,
      currentWrestler: null,
    });
  });

  it('match slots, with the gamertag gone', async () => {
    await addResult({ slots: [{ slotId: 's1', playerId: goneId, wrestlerNameSnapshot: 'Kane' }] });
    await softDelete(goneId);

    const { body } = await call<Array<{ slots: Array<Record<string, unknown>> }>>(getMatches, makeEvent());

    expect(body[0].slots[0]).toMatchObject({ playerName: DELETED_NAME, wrestlerName: 'Kane' });
    expect(body[0].slots[0].psnId).toBeUndefined();
  });

  it('event cards', async () => {
    await addResult();
    const { eventId } = await repos.leagueOps.events.create({ name: 'Show', eventType: 'ppv', date });
    await repos.leagueOps.events.update(eventId, {
      matchCards: [{ position: 1, matchId: 'm1', designation: 'midcard' }],
    });
    await softDelete(goneId);

    const { body } = await call<{
      enrichedMatches: Array<{ matchData: { participants: Array<Record<string, unknown>> } }>;
    }>(getEvent, makeEvent({ pathParameters: { eventId } }));

    expect(body.enrichedMatches[0].matchData.participants[0]).toMatchObject({
      playerName: DELETED_NAME,
      wrestlerName: DELETED_NAME,
    });
  });

  it('the dashboard, without counting them on the roster', async () => {
    await addResult();
    await repos.roster.players.update(goneId, { hasWrestlerRole: true });
    await softDelete(goneId);

    const { body } = await call<{
      recentResults: Array<{ winnerName: string }>;
      quickStats: { totalPlayers: number };
    }>(getDashboard, makeEvent());

    expect(body.recentResults[0].winnerName).toBe(DELETED_NAME);
    expect(body.quickStats.totalPlayers).toBe(1);
  });

  it('the activity feed, where their items stay as they did after a hard delete', async () => {
    await addResult();
    const promo = await repos.content.promos.create({
      playerId: goneId,
      promoType: 'open-mic',
      content: 'x'.repeat(60),
    });
    await softDelete(goneId);

    const { body } = await call<{ items: Array<{ id: string; summary: string }> }>(getActivity, makeEvent());

    const summaries = new Map(body.items.map((item) => [item.id, item.summary]));
    expect(summaries.get('match-m1')).toBe(`${DELETED_NAME} def. Kept Person`);
    expect(summaries.get(`promo-${promo.promoId}`)).toBe(`${DELETED_NAME} posted a promo`);
  });

  it('promos stay listed and never bill the placeholder', async () => {
    const promo = await repos.content.promos.create({
      playerId: goneId,
      promoType: 'open-mic',
      content: 'x'.repeat(60),
    });
    await softDelete(goneId);

    const list = await call<Array<{ playerName: string; wrestlerName: string }>>(getPromos, makeEvent());
    const detail = await call<{ promo: { playerName: string; wrestlerName: string } }>(
      getPromo,
      makeEvent({ pathParameters: { promoId: promo.promoId } }),
    );

    const expected = { playerName: DELETED_NAME, wrestlerName: DELETED_NAME };
    expect(list.body[0]).toMatchObject(expected);
    expect(detail.statusCode).toBe(200);
    expect(detail.body.promo).toMatchObject(expected);
  });

  it('season awards they already won', async () => {
    await addResult({ seasonId: 's1' });
    await softDelete(goneId);

    const { body } = await call<{ autoAwards: Array<{ awardType: string; playerName: string }> }>(
      getSeasonAwards,
      makeEvent({ pathParameters: { seasonId: 's1' } }),
    );

    expect(body.autoAwards.find((award) => award.awardType === 'mvp')?.playerName).toBe(DELETED_NAME);
  });
});

describe('signing up again', () => {
  const signup = (sub: string): PostConfirmationTriggerEvent => ({
    userPoolId: 'pool',
    userName: 'gone@example.com',
    request: {
      userAttributes: { sub, 'custom:player_name': 'Back Again' },
    },
  } as unknown as PostConfirmationTriggerEvent);
  const confirm = (sub: string) => postConfirmation(signup(sub), {} as Context, (() => {}) as Callback);

  it.each([
    ['a new account', 'new-sub'],
    ['the same account', 'gone-sub'],
  ])('creates a fresh player from %s and leaves the old row as history', async (_label, sub) => {
    await softDelete(goneId);

    await confirm(sub);

    const player = await repos.roster.players.findByUserId(sub);
    expect(player).toMatchObject({ name: 'Back Again', wins: 0, losses: 0 });
    expect(player?.playerId).not.toBe(goneId);
    expect((await repos.roster.players.findByIdWithDeleted(goneId))?.name).toBe(DELETED_NAME);
    expect(await repos.roster.players.list()).toHaveLength(2);
  });
});
