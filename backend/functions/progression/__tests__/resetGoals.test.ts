import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

vi.mock('../../../lib/authenticate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/authenticate')>();
  const { presetCallerAuthenticate } = await import('../../../lib/__tests__/presetCallerAuth');
  return { ...actual, authenticate: presetCallerAuthenticate(actual.authenticate) };
});

const { mockCreateNotification, mockInvokeAsync } = vi.hoisted(() => ({
  mockCreateNotification: vi.fn(),
  mockInvokeAsync: vi.fn(),
}));

vi.mock('../../../lib/notifications', () => ({ createNotification: mockCreateNotification }));
vi.mock('../../../lib/asyncLambda', () => ({ invokeAsync: mockInvokeAsync }));
vi.mock('../../../lib/accountStatus', () => ({ isCallerDeactivated: vi.fn().mockResolvedValue(false) }));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import type { InMemoryRosterRepository } from '../../../lib/repositories/inMemory/InMemoryRosterRepository';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Player,
  type ProgressionTrack,
  type Repositories,
} from '../../../lib/repositories';
import { handler } from '../handler';
import { GOALS_RESET_MESSAGE } from '../resetGoals';

const ctx = {} as Context;
const noop = () => {};

const YOUNG = 'div-young';
const MAIN = 'div-main';
const JOINED_AT = '2026-10-01T00:00:00.000Z';

function makeTrack(trackId: string, kind: ProgressionTrack['kind'], fromDivisionId: string): ProgressionTrack {
  return {
    trackId,
    kind,
    name: trackId,
    fromDivisionId,
    toDivisionId: MAIN,
    goals: [{ goalId: 'g1', metric: 'matchesCompeted', threshold: 4, weight: 1 }],
    windowMode: 'allTime',
    isActive: true,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
}

const callupTrack = makeTrack('t-callup', 'callup', YOUNG);
const mainTrack = makeTrack('t-main', 'promotion', MAIN);

let repos: Repositories;

function addPlayer(playerId: string, extra: Partial<Player> = {}): void {
  const row = {
    playerId,
    name: `Name ${playerId}`,
    currentWrestler: `Wrestler ${playerId}`,
    wins: 7,
    losses: 3,
    draws: 1,
    divisionId: YOUNG,
    divisionJoinedAt: JOINED_AT,
    userId: `user-${playerId}`,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...extra,
  } as Player;
  (repos.roster as unknown as InMemoryRosterRepository).playersStore.set(playerId, row);
}

function resetGoals(playerId: string, body: unknown, groups: string | null = 'Moderator') {
  const authorizer = groups == null ? {} : { principalId: 'gm-sub', username: 'gm', groups };
  const event = {
    body: body === undefined ? null : JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: `/progression/players/${playerId}/reset-goals`,
    pathParameters: { playerId },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/progression/players/{playerId}/reset-goals',
    requestContext: { authorizer } as unknown as APIGatewayProxyEvent['requestContext'],
  } as APIGatewayProxyEvent;
  return handler(event, ctx, noop) as Promise<APIGatewayProxyResult>;
}

async function seedRow(trackId: string, considered: boolean): Promise<void> {
  await repos.progression.upsertPlayerProgression({
    playerId: 'p1',
    trackId,
    progressPct: 75,
    goals: [{ goalId: 'g1', current: 3, threshold: 4, met: false }],
    computedAt: '2026-11-10T00:00:00.000Z',
    ...(considered ? { consideration: { status: 'considering', markedBy: 'gm-sub', markedAt: '2026-11-10T00:00:00.000Z' } } : {}),
  });
}

describe('POST /progression/players/{playerId}/reset-goals', () => {
  beforeEach(async () => {
    // Offline mode installs a synthetic Admin for unsigned requests.
    vi.stubEnv('IS_OFFLINE', 'false');
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);
    mockCreateNotification.mockReset();
    mockInvokeAsync.mockReset();
    mockInvokeAsync.mockResolvedValue(undefined);
    await repos.progression.putTrack(callupTrack);
    await repos.progression.putTrack(mainTrack);
    addPlayer('p1');
  });

  afterEach(() => {
    resetRepositoriesForTesting();
    vi.unstubAllEnvs();
  });

  it('needs a signed-in caller', async () => {
    expect((await resetGoals('p1', {}, null)).statusCode).toBe(401);
  });

  it.each(['Wrestler', 'Fantasy'])('refuses a %s', async (group) => {
    await seedRow(callupTrack.trackId, false);
    const result = await resetGoals('p1', {}, group);

    expect(result.statusCode).toBe(403);
    expect(await repos.progression.getPlayerProgression('p1', callupTrack.trackId)).not.toBeNull();
    expect((await repos.roster.players.findById('p1'))?.progressionEpochAt).toBeUndefined();
    expect(await repos.progression.listEvents('p1')).toEqual([]);
  });

  it('returns 404 for an unknown player', async () => {
    const result = await resetGoals('nobody', {});
    expect(result.statusCode).toBe(404);
    expect(mockInvokeAsync).not.toHaveBeenCalled();
  });

  it('returns 400 when the player has no tracks in their division', async () => {
    addPlayer('p2', { divisionId: 'div-empty' });
    const result = await resetGoals('p2', {});
    expect(result.statusCode).toBe(400);
    expect((await repos.roster.players.findById('p2'))?.progressionEpochAt).toBeUndefined();
  });

  it('rejects a non-string note', async () => {
    expect((await resetGoals('p1', { note: 5 })).statusCode).toBe(400);
  });

  it.each(['Moderator', 'Admin'])('sets the epoch, deletes rows and logs goals_reset for a %s', async (group) => {
    await seedRow(callupTrack.trackId, false);
    const result = await resetGoals('p1', { note: '  back from injury ' }, group);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toMatchObject({ playerId: 'p1', deletedTrackIds: [callupTrack.trackId] });

    const player = await repos.roster.players.findById('p1');
    expect(player?.progressionEpochAt).toBe(body.progressionEpochAt);
    // A goals reset never moves the player in the table.
    expect(player?.divisionId).toBe(YOUNG);
    expect(player?.divisionJoinedAt).toBe(JOINED_AT);

    expect(await repos.progression.listByPlayer('p1')).toEqual([]);

    const logged = await repos.progression.listEvents('p1');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      type: 'goals_reset',
      kind: 'callup',
      trackId: callupTrack.trackId,
      fromDivisionId: YOUNG,
      actorUserId: 'gm-sub',
      note: 'back from injury',
    });
    expect(logged[0].toDivisionId).toBeUndefined();

    expect(mockInvokeAsync).toHaveBeenCalledWith('progression', { playerIds: ['p1'], source: 'goalsReset' });
    expect(mockCreateNotification).toHaveBeenCalledWith({
      userId: 'user-p1',
      type: 'progression_goals_reset',
      message: GOALS_RESET_MESSAGE,
      sourceId: 'p1',
      sourceType: 'progression',
    });
  });

  it('accepts an empty body', async () => {
    const result = await resetGoals('p1', undefined);
    expect(result.statusCode).toBe(200);
    const [logged] = await repos.progression.listEvents('p1');
    expect(logged.note).toBeUndefined();
  });

  it('leaves win/loss/draw totals and season standings untouched', async () => {
    await repos.season.standings.increment('s1', 'p1', { wins: 4, losses: 2, draws: 1 });
    const standingBefore = await repos.season.standings.findStanding('s1', 'p1');

    expect((await resetGoals('p1', {})).statusCode).toBe(200);

    const player = await repos.roster.players.findById('p1');
    expect(player).toMatchObject({ wins: 7, losses: 3, draws: 1 });
    expect(await repos.season.standings.findStanding('s1', 'p1')).toEqual(standingBefore);
  });

  it('logs a removed consideration as consideration_removed too', async () => {
    await seedRow(callupTrack.trackId, true);
    const result = await resetGoals('p1', {});

    expect(result.statusCode).toBe(200);
    const logged = await repos.progression.listEvents('p1');
    expect(logged.map((row) => row.type).sort()).toEqual(['consideration_removed', 'goals_reset']);
    expect(logged.find((row) => row.type === 'consideration_removed')).toMatchObject({
      trackId: callupTrack.trackId,
      kind: 'callup',
      fromDivisionId: YOUNG,
      actorUserId: 'gm-sub',
    });
    expect(await repos.progression.getPlayerProgression('p1', callupTrack.trackId)).toBeNull();
  });

  it('still succeeds when the recompute invoke fails', async () => {
    mockInvokeAsync.mockRejectedValue(new Error('throttled'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await resetGoals('p1', {})).statusCode).toBe(200);
    warn.mockRestore();
  });

  it('shows the reset in the progression history with its note', async () => {
    await resetGoals('p1', { note: 'storyline reset' });
    const event = {
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'GET',
      isBase64Encoded: false,
      path: '/progression/events',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: '/progression/events',
      requestContext: { authorizer: { principalId: 'gm-sub', username: 'gm', groups: 'Admin' } } as unknown as APIGatewayProxyEvent['requestContext'],
    } as APIGatewayProxyEvent;
    const result = (await handler(event, ctx, noop)) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(200);
    const [entry] = JSON.parse(result.body);
    expect(entry).toMatchObject({ type: 'goals_reset', trackName: 't-callup', note: 'storyline reset' });
  });
});
