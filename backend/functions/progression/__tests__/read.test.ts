import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context, Callback } from 'aws-lambda';

const { mockInvokeAsync } = vi.hoisted(() => ({ mockInvokeAsync: vi.fn() }));

vi.mock('../../../lib/asyncLambda', () => ({ invokeAsync: mockInvokeAsync }));

/**
 * Stands in for Cognito verification: the bearer token names the caller.
 * Unknown or missing tokens fail, like an invalid JWT.
 */
const CALLERS: Record<string, { sub: string; groups: string }> = {
  owner: { sub: 'user-owner', groups: 'Wrestler' },
  other: { sub: 'user-other', groups: 'Wrestler' },
  mod: { sub: 'user-mod', groups: 'Moderator' },
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
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import type { ProgressionTrack } from '../../../lib/repositories/types';
import { handler } from '../handler';

type Caller = 'anon' | keyof typeof CALLERS;

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(
  caller: Caller,
  method: string,
  resource: string,
  options: { pathParameters?: Record<string, string>; body?: unknown; query?: Record<string, string> } = {},
): APIGatewayProxyEvent {
  return {
    body: options.body === undefined ? null : JSON.stringify(options.body),
    headers: caller === 'anon' ? {} : { Authorization: `Bearer ${caller}` },
    multiValueHeaders: {},
    httpMethod: method,
    isBase64Encoded: false,
    path: resource,
    pathParameters: options.pathParameters ?? null,
    queryStringParameters: options.query ?? null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource,
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

async function call(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return (await handler(event, ctx, cb)) as APIGatewayProxyResult;
}

let youngBoysId: string;
let rawId: string;
let ownerPlayerId: string;
let otherPlayerId: string;
let track: ProgressionTrack;

beforeEach(async () => {
  vi.clearAllMocks();
  mockInvokeAsync.mockResolvedValue(undefined);
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);

  const { divisions } = repos.leagueOps;
  youngBoysId = (await divisions.create({ name: 'Young Boys', isDevelopmental: true })).divisionId;
  rawId = (await divisions.create({ name: 'Raw' })).divisionId;

  const { players } = repos.roster;
  const owner = await players.create({ name: 'Owen', currentWrestler: 'Cena', divisionId: youngBoysId, imageUrl: 'img.png' });
  await players.update(owner.playerId, { userId: 'user-owner' });
  ownerPlayerId = owner.playerId;
  const other = await players.create({ name: 'Otto', currentWrestler: 'Rock', divisionId: youngBoysId });
  await players.update(other.playerId, { userId: 'user-other' });
  otherPlayerId = other.playerId;
  await players.create({ name: 'Rita', currentWrestler: 'Bianca', divisionId: rawId });

  const now = new Date().toISOString();
  track = await repos.progression.putTrack({
    trackId: 'track-1',
    kind: 'callup',
    name: 'Young Boys Call-Up',
    fromDivisionId: youngBoysId,
    goals: [
      { goalId: 'wins', metric: 'wins', threshold: 5, weight: 1 },
      { goalId: 'matches', metric: 'matchesCompeted', threshold: 10, weight: 1 },
    ],
    windowMode: 'sinceJoinedDivision',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  await repos.progression.upsertPlayerProgression({
    playerId: ownerPlayerId,
    trackId: 'track-1',
    progressPct: 40,
    goals: [
      { goalId: 'wins', current: 2, threshold: 5, met: false },
      { goalId: 'matches', current: 4, threshold: 10, met: false },
    ],
    computedAt: now,
  });
  await repos.progression.setConsideration(ownerPlayerId, 'track-1', {
    status: 'considering',
    markedBy: 'user-mod',
    markedAt: now,
    note: 'Ready soon',
  });
  await repos.progression.upsertPlayerProgression({
    playerId: otherPlayerId,
    trackId: 'track-1',
    progressPct: 75,
    goals: [
      { goalId: 'wins', current: 5, threshold: 5, met: true },
      { goalId: 'matches', current: 5, threshold: 10, met: false },
    ],
    computedAt: now,
  });
});

describe('GET /progression/players/{playerId}', () => {
  const resource = '/progression/players/{playerId}';
  const read = async (caller: Caller) => {
    const result = await call(makeEvent(caller, 'GET', resource, { pathParameters: { playerId: ownerPlayerId } }));
    expect(result.statusCode).toBe(200);
    return JSON.parse(result.body);
  };

  it('gives anonymous callers the summary only', async () => {
    const body = await read('anon');
    expect(body).toEqual([
      {
        trackId: 'track-1',
        kind: 'callup',
        trackName: 'Young Boys Call-Up',
        progressPct: 40,
        consideration: true,
        computedAt: expect.any(String),
      },
    ]);
  });

  it('gives another wrestler the summary only', async () => {
    const [row] = await read('other');
    expect(row.goals).toBeUndefined();
    expect(row.considerationDetail).toBeUndefined();
    expect(row.consideration).toBe(true);
  });

  it('gives the owner goal detail but not the GM note', async () => {
    const [row] = await read('owner');
    expect(row.goals).toEqual([
      { goalId: 'wins', metric: 'wins', threshold: 5, weight: 1, direction: 'atLeast', current: 2, met: false },
      { goalId: 'matches', metric: 'matchesCompeted', threshold: 10, weight: 1, direction: 'atLeast', current: 4, met: false },
    ]);
    expect(row.considerationDetail).toBeUndefined();
  });

  it('gives a Moderator goal detail and the GM note', async () => {
    const [row] = await read('mod');
    expect(row.goals).toHaveLength(2);
    expect(row.considerationDetail).toMatchObject({ markedBy: 'user-mod', note: 'Ready soon' });
  });

  it('omits rows for inactive tracks', async () => {
    await repos.progression.putTrack({ ...track, isActive: false });
    expect(await read('mod')).toEqual([]);
  });

  it('returns 404 for an unknown player', async () => {
    const result = await call(makeEvent('anon', 'GET', resource, { pathParameters: { playerId: 'nope' } }));
    expect(result.statusCode).toBe(404);
  });

  it('hides a deactivated player from others but not from the owner or staff', async () => {
    await repos.roster.players.update(ownerPlayerId, { currentWrestler: '' });
    const event = (caller: Caller) => makeEvent(caller, 'GET', resource, { pathParameters: { playerId: ownerPlayerId } });
    expect((await call(event('anon'))).statusCode).toBe(404);
    expect((await call(event('other'))).statusCode).toBe(404);
    expect((await call(event('owner'))).statusCode).toBe(200);
    expect((await call(event('mod'))).statusCode).toBe(200);
  });
});

describe('GET /progression/tracks/{trackId}/players', () => {
  const resource = '/progression/tracks/{trackId}/players';
  const board = (caller: Caller, query?: Record<string, string>) =>
    call(makeEvent(caller, 'GET', resource, { pathParameters: { trackId: 'track-1' }, query }));

  it('rejects anonymous callers and wrestlers, including the owner', async () => {
    expect((await board('anon')).statusCode).toBe(401);
    expect((await board('other')).statusCode).toBe(403);
    expect((await board('owner')).statusCode).toBe(403);
  });

  it('lists candidates for a Moderator, highest progress first, joined with player data', async () => {
    const result = await board('mod');
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.track.trackId).toBe('track-1');
    expect(body.players.map((p: { playerId: string }) => p.playerId)).toEqual([otherPlayerId, ownerPlayerId]);
    expect(body.players[1]).toMatchObject({
      name: 'Owen',
      wrestlerName: 'Cena',
      imageUrl: 'img.png',
      progressPct: 40,
      consideration: { note: 'Ready soon' },
    });
  });

  it('drops players who left the source division and honours limit', async () => {
    await repos.roster.players.update(otherPlayerId, { divisionId: rawId });
    const body = JSON.parse((await board('mod')).body);
    expect(body.players.map((p: { playerId: string }) => p.playerId)).toEqual([ownerPlayerId]);

    await repos.roster.players.update(otherPlayerId, { divisionId: youngBoysId });
    const limited = JSON.parse((await board('mod', { limit: '1' })).body);
    expect(limited.players).toHaveLength(1);
    expect((await board('mod', { limit: '0' })).statusCode).toBe(400);
  });

  it('adds the latest completed match date, ignoring scheduled matches', async () => {
    const { matches } = repos.competition;
    await matches.create({ matchId: 'm-old', date: '2026-10-01T20:00:00.000Z', status: 'completed', participants: [ownerPlayerId, otherPlayerId] });
    await matches.create({ matchId: 'm-new', date: '2026-11-01T20:00:00.000Z', status: 'completed', participants: [ownerPlayerId] });
    await matches.create({ matchId: 'm-next', date: '2026-12-01T20:00:00.000Z', status: 'scheduled', participants: [otherPlayerId] });

    const body = JSON.parse((await board('mod')).body);
    const byId = new Map(body.players.map((p: { playerId: string; lastMatchDate?: string }) => [p.playerId, p.lastMatchDate]));
    expect(byId.get(ownerPlayerId)).toBe('2026-11-01T20:00:00.000Z');
    expect(byId.get(otherPlayerId)).toBe('2026-10-01T20:00:00.000Z');
  });

  it('omits lastMatchDate for a player with no completed match', async () => {
    const body = JSON.parse((await board('mod')).body);
    expect(body.players[0]).not.toHaveProperty('lastMatchDate');
  });

  it('returns 404 for an unknown track', async () => {
    const result = await call(makeEvent('mod', 'GET', resource, { pathParameters: { trackId: 'nope' } }));
    expect(result.statusCode).toBe(404);
  });
});

describe('GET /progression/tracks', () => {
  it('is public and filters by kind and isActive', async () => {
    const all = await call(makeEvent('anon', 'GET', '/progression/tracks'));
    expect(all.statusCode).toBe(200);
    expect(JSON.parse(all.body)).toHaveLength(1);

    const none = await call(makeEvent('anon', 'GET', '/progression/tracks', { query: { kind: 'promotion' } }));
    expect(JSON.parse(none.body)).toEqual([]);

    const bad = await call(makeEvent('anon', 'GET', '/progression/tracks', { query: { kind: 'sideways' } }));
    expect(bad.statusCode).toBe(400);
  });
});

describe('POST /progression/tracks', () => {
  const validBody = () => ({
    kind: 'promotion',
    name: 'Raw Promotion',
    fromDivisionId: rawId,
    goals: [{ metric: 'wins', threshold: 3 }],
  });
  const post = (caller: Caller, body: unknown) => call(makeEvent(caller, 'POST', '/progression/tracks', { body }));

  it('rejects anonymous callers and wrestlers', async () => {
    expect((await post('anon', validBody())).statusCode).toBe(401);
    expect((await post('owner', validBody())).statusCode).toBe(403);
    expect((await post('other', validBody())).statusCode).toBe(403);
    expect(await repos.progression.listTracks()).toHaveLength(1);
  });

  it('creates a track with defaults and queues a recompute of the source division', async () => {
    const result = await post('mod', validBody());
    expect(result.statusCode).toBe(201);
    const created = JSON.parse(result.body);
    expect(created).toMatchObject({
      kind: 'promotion',
      name: 'Raw Promotion',
      fromDivisionId: rawId,
      windowMode: 'sinceJoinedDivision',
      isActive: true,
    });
    expect(created.goals[0]).toMatchObject({ metric: 'wins', threshold: 3, weight: 1 });
    expect(typeof created.goals[0].goalId).toBe('string');
    expect(await repos.progression.getTrack(created.trackId)).not.toBeNull();

    expect(mockInvokeAsync).toHaveBeenCalledTimes(1);
    const [fn, payload] = mockInvokeAsync.mock.calls[0];
    expect(fn).toBe('progression');
    expect(payload.playerIds).toHaveLength(1);
  });

  it('still saves the track when the recompute invoke fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockInvokeAsync.mockRejectedValueOnce(new Error('throttled'));
    const result = await post('mod', validBody());
    expect(result.statusCode).toBe(201);
    expect(await repos.progression.listTracks()).toHaveLength(2);
  });

  it.each([
    ['empty goals', { goals: [] }],
    ['zero threshold', { goals: [{ metric: 'wins', threshold: 0 }] }],
    ['unknown metric', { goals: [{ metric: 'pinfalls', threshold: 3 }] }],
    ['unknown kind', { kind: 'sideways' }],
    ['unknown division', { fromDivisionId: 'nope' }],
    ['same from and to', { toDivisionId: 'SAME' }],
    ['bad params', { goals: [{ metric: 'avgStarRating', threshold: 3, params: { minRatedMatches: 0 } }] }],
  ])('rejects %s with 400', async (_label, override) => {
    const body: Record<string, unknown> = { ...validBody(), ...override };
    if (body.toDivisionId === 'SAME') body.toDivisionId = rawId;
    const result = await post('mod', body);
    expect(result.statusCode).toBe(400);
    expect(mockInvokeAsync).not.toHaveBeenCalled();
  });

  it('allows only one active track per kind and source division', async () => {
    const body = { kind: 'callup', name: 'Second', fromDivisionId: youngBoysId, goals: [{ metric: 'wins', threshold: 1 }] };
    expect((await post('mod', body)).statusCode).toBe(409);
    expect((await post('mod', { ...body, isActive: false })).statusCode).toBe(201);
  });
});

describe('PUT /progression/tracks/{trackId}', () => {
  const resource = '/progression/tracks/{trackId}';
  const put = (caller: Caller, body: unknown, trackId = 'track-1') =>
    call(makeEvent(caller, 'PUT', resource, { pathParameters: { trackId }, body }));

  it('rejects anonymous callers and wrestlers', async () => {
    expect((await put('anon', { name: 'X' })).statusCode).toBe(401);
    expect((await put('owner', { name: 'X' })).statusCode).toBe(403);
    expect((await put('other', { name: 'X' })).statusCode).toBe(403);
    expect((await repos.progression.getTrack('track-1'))?.name).toBe('Young Boys Call-Up');
  });

  it('merges a partial update, keeps createdAt, and recomputes the division', async () => {
    const result = await put('mod', { name: 'Renamed', toDivisionId: rawId });
    expect(result.statusCode).toBe(200);
    const saved = JSON.parse(result.body);
    expect(saved).toMatchObject({ name: 'Renamed', toDivisionId: rawId, createdAt: track.createdAt });
    expect(saved.goals).toEqual(track.goals);

    expect(mockInvokeAsync).toHaveBeenCalledTimes(1);
    expect(mockInvokeAsync.mock.calls[0][1].playerIds.sort()).toEqual([ownerPlayerId, otherPlayerId].sort());
  });

  it('clears toDivisionId with null and validates replaced goals', async () => {
    await put('mod', { toDivisionId: rawId });
    const cleared = JSON.parse((await put('mod', { toDivisionId: null })).body);
    expect(cleared.toDivisionId).toBeUndefined();
    expect((await put('mod', { goals: [{ metric: 'wins', threshold: -1 }] })).statusCode).toBe(400);
  });

  it('does not count the track itself against the one-active rule', async () => {
    expect((await put('mod', { isActive: true })).statusCode).toBe(200);
  });

  it('returns 404 for an unknown track', async () => {
    expect((await put('mod', { name: 'X' }, 'nope')).statusCode).toBe(404);
  });
});
