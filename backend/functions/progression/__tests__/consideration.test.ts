import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

const { mockCreateNotification } = vi.hoisted(() => ({ mockCreateNotification: vi.fn() }));

vi.mock('../../../lib/notifications', () => ({ createNotification: mockCreateNotification }));
vi.mock('../../../lib/accountStatus', () => ({ isCallerDeactivated: vi.fn().mockResolvedValue(false) }));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import type { InMemoryRosterRepository } from '../../../lib/repositories/inMemory/InMemoryRosterRepository';
import {
  ConcurrencyError,
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Player,
  type ProgressionTrack,
  type Repositories,
} from '../../../lib/repositories';
import { handler } from '../handler';

const ctx = {} as Context;
const noop = () => {};

const YOUNG = 'div-young';
const MAIN = 'div-main';

const track: ProgressionTrack = {
  trackId: 't-callup',
  kind: 'callup',
  name: 'Young Boys',
  fromDivisionId: YOUNG,
  toDivisionId: MAIN,
  goals: [{ goalId: 'g1', metric: 'matchesCompeted', threshold: 4, weight: 1 }],
  windowMode: 'allTime',
  isActive: true,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

let repos: Repositories;

function playerRow(playerId: string, extra: Partial<Player> = {}): Player {
  return {
    playerId,
    name: `Name ${playerId}`,
    currentWrestler: `Wrestler ${playerId}`,
    wins: 0,
    losses: 0,
    draws: 0,
    divisionId: YOUNG,
    userId: `user-${playerId}`,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...extra,
  } as Player;
}

function addPlayer(playerId: string, extra: Partial<Player> = {}): void {
  (repos.roster as unknown as InMemoryRosterRepository).playersStore.set(playerId, playerRow(playerId, extra));
}

function makeEvent(options: {
  method: 'GET' | 'PUT';
  resource: string;
  pathParameters?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  groups?: string | null;
}): APIGatewayProxyEvent {
  const authorizer = options.groups == null
    ? {}
    : { principalId: 'gm-sub', username: 'gm', groups: options.groups };
  return {
    body: options.body === undefined ? null : JSON.stringify(options.body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: options.method,
    isBase64Encoded: false,
    path: options.resource,
    pathParameters: options.pathParameters ?? null,
    queryStringParameters: options.query ?? null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: options.resource,
    requestContext: { authorizer } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

async function call(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return (await handler(event, ctx, noop)) as APIGatewayProxyResult;
}

function put(playerId: string, body: unknown, groups: string | null = 'Moderator') {
  return call(makeEvent({
    method: 'PUT',
    resource: '/progression/players/{playerId}/consideration',
    pathParameters: { playerId },
    body,
    groups,
  }));
}

function list(query?: Record<string, string>) {
  return call(makeEvent({ method: 'GET', resource: '/progression/considerations', query }));
}

async function events(playerId: string) {
  return repos.progression.listEvents(playerId);
}

describe('progression considerations', () => {
  beforeEach(async () => {
    // Offline mode installs a synthetic Admin for unsigned requests.
    vi.stubEnv('IS_OFFLINE', 'false');
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);
    mockCreateNotification.mockReset();
    await repos.progression.putTrack(track);
    addPlayer('p1');
  });

  afterEach(() => {
    resetRepositoriesForTesting();
    vi.unstubAllEnvs();
  });

  describe('PUT /progression/players/{playerId}/consideration', () => {
    it('needs a signed-in caller', async () => {
      const result = await put('p1', { trackId: track.trackId, considering: true }, null);
      expect(result.statusCode).toBe(401);
    });

    it.each(['Wrestler', 'Fantasy'])('refuses a %s', async (group) => {
      const result = await put('p1', { trackId: track.trackId, considering: true }, group);
      expect(result.statusCode).toBe(403);
      expect(await events('p1')).toEqual([]);
    });

    it.each(['Moderator', 'Admin'])('lets a %s mark a player', async (group) => {
      const result = await put('p1', { trackId: track.trackId, considering: true }, group);
      expect(result.statusCode).toBe(200);
    });

    it('marks a player with no progression row yet: computes the row and logs one event', async () => {
      const result = await put('p1', { trackId: track.trackId, considering: true, note: '  ready soon ' });

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toMatchObject({ playerId: 'p1', trackId: track.trackId, considering: true, changed: true });
      expect(body.consideration).toMatchObject({ status: 'considering', markedBy: 'gm-sub', note: 'ready soon' });

      const row = await repos.progression.getPlayerProgression('p1', track.trackId);
      expect(row?.consideration?.markedBy).toBe('gm-sub');
      expect(row?.progressPct).toBe(0);
      expect(row?.goals).toEqual([{ goalId: 'g1', current: 0, threshold: 4, met: false }]);

      const logged = await events('p1');
      expect(logged).toHaveLength(1);
      expect(logged[0]).toMatchObject({
        type: 'consideration_added',
        kind: 'callup',
        trackId: track.trackId,
        fromDivisionId: YOUNG,
        toDivisionId: MAIN,
        actorUserId: 'gm-sub',
      });
    });

    it('keeps the computed fields of an existing row', async () => {
      await repos.progression.upsertPlayerProgression({
        playerId: 'p1',
        trackId: track.trackId,
        progressPct: 75,
        goals: [{ goalId: 'g1', current: 3, threshold: 4, met: false }],
        computedAt: '2026-11-11T00:00:00.000Z',
      });

      await put('p1', { trackId: track.trackId, considering: true });

      const row = await repos.progression.getPlayerProgression('p1', track.trackId);
      expect(row?.progressPct).toBe(75);
      expect(row?.computedAt).toBe('2026-11-11T00:00:00.000Z');
      expect(row?.consideration).toBeDefined();
    });

    it('notifies the wrestler when marked', async () => {
      await put('p1', { trackId: track.trackId, considering: true });

      expect(mockCreateNotification).toHaveBeenCalledTimes(1);
      expect(mockCreateNotification).toHaveBeenCalledWith({
        userId: 'user-p1',
        type: 'progression_consideration',
        message: 'The GMs are considering you for a call-up!',
        sourceId: 'p1',
        sourceType: 'progression',
      });
    });

    it('treats a re-mark as a no-op: no second event or notification', async () => {
      const first = JSON.parse((await put('p1', { trackId: track.trackId, considering: true, note: 'a' })).body);
      const again = await put('p1', { trackId: track.trackId, considering: true, note: 'b' });

      expect(again.statusCode).toBe(200);
      const body = JSON.parse(again.body);
      expect(body.changed).toBe(false);
      expect(body.consideration).toEqual(first.consideration);
      expect(await events('p1')).toHaveLength(1);
      expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    });

    it('unmarking clears the flag, appends an event and sends no notification', async () => {
      await put('p1', { trackId: track.trackId, considering: true });
      mockCreateNotification.mockReset();

      const result = await put('p1', { trackId: track.trackId, considering: false });

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({ considering: false, changed: true, consideration: null });
      const row = await repos.progression.getPlayerProgression('p1', track.trackId);
      expect(row?.consideration).toBeUndefined();
      const logged = await events('p1');
      expect(logged.map((e) => e.type).sort()).toEqual(['consideration_added', 'consideration_removed']);
      expect(mockCreateNotification).not.toHaveBeenCalled();
    });

    it('unmarking a player who is not marked is a no-op', async () => {
      const result = await put('p1', { trackId: track.trackId, considering: false });

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).changed).toBe(false);
      expect(await events('p1')).toEqual([]);
      expect(await repos.progression.getPlayerProgression('p1', track.trackId)).toBeNull();
    });

    it('reports a lost race as a no-op when the other request already marked the player', async () => {
      const original = repos.runInTransaction;
      repos.runInTransaction = async (fn) => {
        // Another GM's mark lands between our read and our commit.
        await repos.progression.upsertPlayerProgression({
          playerId: 'p1',
          trackId: track.trackId,
          progressPct: 0,
          goals: [],
          computedAt: '2026-11-12T00:00:00.000Z',
          consideration: { status: 'considering', markedBy: 'other', markedAt: '2026-11-12T00:00:00.000Z' },
        });
        return original(fn);
      };

      const result = await put('p1', { trackId: track.trackId, considering: true });

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({ changed: false, consideration: { markedBy: 'other' } });
      expect(await events('p1')).toEqual([]);
      expect(mockCreateNotification).not.toHaveBeenCalled();
    });

    it('returns 409 when the guarded write fails and the state differs', async () => {
      repos.runInTransaction = async () => {
        throw new ConcurrencyError('PlayerProgression', 'p1/t-callup');
      };
      const result = await put('p1', { trackId: track.trackId, considering: true });
      expect(result.statusCode).toBe(409);
    });

    it.each([
      [{ considering: true }, 'trackId is required'],
      [{ trackId: 't-callup' }, 'considering must be a boolean'],
      [{ trackId: 't-callup', considering: 'yes' }, 'considering must be a boolean'],
      [{ trackId: 't-callup', considering: true, note: 5 }, 'note must be a string'],
      [{ trackId: 't-callup', considering: true, note: 'x'.repeat(501) }, 'note must be at most 500 characters'],
    ])('rejects body %j', async (body, message) => {
      const result = await put('p1', body);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe(message);
    });

    it('404s on an unknown track or player', async () => {
      expect((await put('p1', { trackId: 'nope', considering: true })).statusCode).toBe(404);
      expect((await put('ghost', { trackId: track.trackId, considering: true })).statusCode).toBe(404);
    });

    it('refuses to mark on an inactive track or a player outside its division', async () => {
      addPlayer('p2', { divisionId: MAIN });
      expect((await put('p2', { trackId: track.trackId, considering: true })).statusCode).toBe(400);

      await repos.progression.putTrack({ ...track, isActive: false });
      expect((await put('p1', { trackId: track.trackId, considering: true })).statusCode).toBe(400);
      expect(mockCreateNotification).not.toHaveBeenCalled();
    });

    it('does not notify on a relegation mark', async () => {
      await repos.progression.putTrack({ ...track, trackId: 't-rel', kind: 'relegation', toDivisionId: undefined });
      const result = await put('p1', { trackId: 't-rel', considering: true });
      expect(result.statusCode).toBe(200);
      expect(mockCreateNotification).not.toHaveBeenCalled();
    });
  });

  describe('GET /progression/considerations', () => {
    it('is public and lists marked players with names, newest first', async () => {
      addPlayer('p2');
      addPlayer('p3');
      await put('p1', { trackId: track.trackId, considering: true });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await put('p2', { trackId: track.trackId, considering: true, note: 'private' });
      await repos.progression.upsertPlayerProgression({
        playerId: 'p3', trackId: track.trackId, progressPct: 99, goals: [], computedAt: '2026-11-12T00:00:00.000Z',
      });

      const result = await list({ kind: 'callup' });

      expect(result.statusCode).toBe(200);
      const items = JSON.parse(result.body);
      expect(items.map((i: { playerId: string }) => i.playerId)).toEqual(['p2', 'p1']);
      expect(Object.keys(items[0]).sort()).toEqual(['markedAt', 'name', 'playerId', 'trackId', 'wrestlerName']);
      expect(items[0]).toMatchObject({ name: 'Name p2', wrestlerName: 'Wrestler p2', trackId: track.trackId });
    });

    it('defaults to callup and ignores other kinds and inactive tracks', async () => {
      await repos.progression.putTrack({ ...track, trackId: 't-promo', kind: 'promotion' });
      await put('p1', { trackId: 't-promo', considering: true });
      expect(JSON.parse((await list()).body)).toEqual([]);
      expect(JSON.parse((await list({ kind: 'promotion' })).body)).toHaveLength(1);

      await repos.progression.putTrack({ ...track, trackId: 't-promo', kind: 'promotion', isActive: false });
      expect(JSON.parse((await list({ kind: 'promotion' })).body)).toEqual([]);
    });

    it('hides deactivated, wrestler-less and deleted players', async () => {
      addPlayer('p2');
      addPlayer('p3');
      for (const id of ['p1', 'p2', 'p3']) await put(id, { trackId: track.trackId, considering: true });
      addPlayer('p1', { deactivatedAt: '2026-11-12T00:00:00.000Z' });
      addPlayer('p2', { currentWrestler: 'Needs Wrestler' });
      addPlayer('p3', { deletedAt: '2026-11-12T00:00:00.000Z' });

      expect(JSON.parse((await list()).body)).toEqual([]);
    });

    it('rejects an unknown kind', async () => {
      expect((await list({ kind: 'sideways' })).statusCode).toBe(400);
    });
  });
});
