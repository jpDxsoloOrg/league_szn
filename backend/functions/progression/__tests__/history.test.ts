import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context, Callback } from 'aws-lambda';

vi.mock('../../../lib/asyncLambda', () => ({ invokeAsync: vi.fn() }));

/** Stands in for Cognito verification: the bearer token names the caller. */
const CALLERS: Record<string, { sub: string; groups: string }> = {
  wrestler: { sub: 'user-wrestler', groups: 'Wrestler' },
  mod: { sub: 'user-mod', groups: 'Moderator' },
  admin: { sub: 'user-admin', groups: 'Admin' },
};

vi.mock('../../../lib/authenticate', () => ({
  authenticate: async (event: APIGatewayProxyEvent) => {
    const header = event.headers?.Authorization ?? '';
    const caller = CALLERS[header.replace('Bearer ', '')];
    if (!caller) return { ok: false };
    event.requestContext.authorizer = {
      principalId: caller.sub,
      username: caller.sub,
      email: '',
      groups: caller.groups,
    };
    return { ok: true };
  },
}));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import type { InMemoryRosterRepository } from '../../../lib/repositories/inMemory/InMemoryRosterRepository';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import type { ProgressionEvent } from '../../../lib/repositories/types';
import { handler } from '../handler';

type Caller = 'anon' | keyof typeof CALLERS;

const RESOURCE = '/progression/events';
let repos: Repositories;
let youngBoysId: string;
let rawId: string;
let playerId: string;

function makeEvent(caller: Caller, query?: Record<string, string>): APIGatewayProxyEvent {
  return {
    body: null,
    headers: caller === 'anon' ? {} : { Authorization: `Bearer ${caller}` },
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: RESOURCE,
    pathParameters: null,
    queryStringParameters: query ?? null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: RESOURCE,
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

async function list(caller: Caller, query?: Record<string, string>): Promise<APIGatewayProxyResult> {
  return (await handler(makeEvent(caller, query), {} as Context, (() => {}) as Callback)) as APIGatewayProxyResult;
}

function event(overrides: Partial<ProgressionEvent> & Pick<ProgressionEvent, 'eventId' | 'createdAt'>): ProgressionEvent {
  return {
    playerId,
    trackId: 'track-callup',
    kind: 'callup',
    type: 'consideration_added',
    fromDivisionId: youngBoysId,
    actorUserId: 'user-mod',
    ...overrides,
  };
}

beforeEach(async () => {
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);

  const { divisions } = repos.leagueOps;
  youngBoysId = (await divisions.create({ name: 'Young Boys', isDevelopmental: true })).divisionId;
  rawId = (await divisions.create({ name: 'Raw' })).divisionId;

  const { players } = repos.roster;
  playerId = (await players.create({ name: 'Owen', currentWrestler: 'Cena', divisionId: youngBoysId })).playerId;
  const gm = await players.create({ name: 'GM Gina', currentWrestler: 'Lita', divisionId: rawId });
  await players.update(gm.playerId, { userId: 'user-mod' });

  const now = new Date().toISOString();
  const baseTrack = {
    fromDivisionId: youngBoysId,
    goals: [{ goalId: 'wins', metric: 'wins' as const, threshold: 5, weight: 1 }],
    windowMode: 'allTime' as const,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  await repos.progression.putTrack({ ...baseTrack, trackId: 'track-callup', kind: 'callup', name: 'Call-Up', toDivisionId: rawId });
  await repos.progression.putTrack({ ...baseTrack, trackId: 'track-promo', kind: 'promotion', name: 'Promotion' });

  const { progression } = repos;
  await progression.appendEvent(event({ eventId: 'e1', createdAt: '2026-11-01T10:00:00.000Z' }));
  await progression.appendEvent(event({
    eventId: 'e3',
    createdAt: '2026-11-03T10:00:00.000Z',
    type: 'executed',
    toDivisionId: rawId,
  }));
  await progression.appendEvent(event({
    eventId: 'e2',
    createdAt: '2026-11-02T10:00:00.000Z',
    type: 'consideration_removed',
    actorUserId: 'system',
  }));
  await progression.appendEvent(event({
    eventId: 'e4',
    createdAt: '2026-11-04T10:00:00.000Z',
    trackId: 'track-promo',
    kind: 'promotion',
    actorUserId: 'b1f2c3d4-0000-4000-8000-000000000000',
  }));
});

describe('GET /progression/events', () => {
  it('requires Moderator+', async () => {
    expect((await list('anon')).statusCode).toBe(401);
    expect((await list('wrestler')).statusCode).toBe(403);
    expect((await list('mod')).statusCode).toBe(200);
    expect((await list('admin')).statusCode).toBe(200);
  });

  it('lists every event newest first', async () => {
    const body = JSON.parse((await list('mod')).body);
    expect(body.map((row: { eventId: string }) => row.eventId)).toEqual(['e4', 'e3', 'e2', 'e1']);
  });

  it('joins player, track, division and actor names', async () => {
    const body = JSON.parse((await list('mod')).body);
    const byId = new Map(body.map((row: { eventId: string }) => [row.eventId, row]));
    expect(byId.get('e3')).toEqual({
      eventId: 'e3',
      type: 'executed',
      kind: 'callup',
      trackId: 'track-callup',
      trackName: 'Call-Up',
      playerId,
      playerName: 'Owen',
      wrestlerName: 'Cena',
      fromDivisionId: youngBoysId,
      fromDivisionName: 'Young Boys',
      toDivisionId: rawId,
      toDivisionName: 'Raw',
      actorUserId: 'user-mod',
      actorName: 'GM Gina',
      createdAt: '2026-11-03T10:00:00.000Z',
    });
    expect(byId.get('e1')).not.toHaveProperty('toDivisionId');
    expect(byId.get('e2')).toMatchObject({ actorUserId: 'system', actorName: null });
    expect(byId.get('e4')).toMatchObject({ actorName: null, trackName: 'Promotion' });
  });

  it('keeps the name of a player deleted since the event', async () => {
    const store = (repos.roster as unknown as InMemoryRosterRepository).playersStore;
    const row = store.get(playerId);
    if (!row) throw new Error('player missing');
    store.set(playerId, { ...row, deletedAt: new Date().toISOString() });
    const body = JSON.parse((await list('mod')).body);
    expect(body[0].playerName).toBe('Owen');
  });

  it('honours limit and defaults to 50', async () => {
    const limited = JSON.parse((await list('mod', { limit: '2' })).body);
    expect(limited.map((row: { eventId: string }) => row.eventId)).toEqual(['e4', 'e3']);

    for (let index = 0; index < 60; index += 1) {
      await repos.progression.appendEvent(event({ eventId: `bulk-${index}`, createdAt: '2026-10-01T00:00:00.000Z' }));
    }
    expect(JSON.parse((await list('mod')).body)).toHaveLength(50);
  });

  it('rejects an invalid limit', async () => {
    for (const limit of ['0', '201', '1.5', 'abc']) {
      expect((await list('mod', { limit })).statusCode).toBe(400);
    }
  });

  it('filters by trackId', async () => {
    const body = JSON.parse((await list('mod', { trackId: 'track-promo' })).body);
    expect(body.map((row: { eventId: string }) => row.eventId)).toEqual(['e4']);
  });

  it('filters by kind and rejects an unknown kind', async () => {
    const body = JSON.parse((await list('mod', { kind: 'callup' })).body);
    expect(body.map((row: { eventId: string }) => row.eventId)).toEqual(['e3', 'e2', 'e1']);
    expect((await list('mod', { kind: 'nope' })).statusCode).toBe(400);
  });

  it('combines trackId, kind and limit', async () => {
    const body = JSON.parse((await list('mod', { trackId: 'track-callup', kind: 'callup', limit: '1' })).body);
    expect(body.map((row: { eventId: string }) => row.eventId)).toEqual(['e3']);
    const none = JSON.parse((await list('mod', { trackId: 'track-callup', kind: 'promotion' })).body);
    expect(none).toEqual([]);
  });
});
