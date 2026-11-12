import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Callback, Context } from 'aws-lambda';
import type { Repositories } from '../../../lib/repositories/registry';
import type { ProgressionTrack } from '../../../lib/repositories';
import type { UnitOfWork } from '../../../lib/repositories/unitOfWork';

const { state, mockCreateNotification, mockInvokeAsync } = vi.hoisted(() => ({
  state: { repos: undefined as unknown as Repositories },
  mockCreateNotification: vi.fn(),
  mockInvokeAsync: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => state.repos,
}));
vi.mock('../../../lib/notifications', () => ({ createNotification: mockCreateNotification }));
vi.mock('../../../lib/asyncLambda', () => ({ invokeAsync: mockInvokeAsync }));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import { handler } from '../executeProgression';

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(playerId: string, body: Record<string, unknown>): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    headers: {},
    httpMethod: 'POST',
    pathParameters: { playerId },
    requestContext: {
      authorizer: { groups: 'Admin', username: 'gm', email: 'gm@test.com', principalId: 'sub-gm' },
    },
  } as unknown as APIGatewayProxyEvent;
}

async function call(playerId: string, body: Record<string, unknown>): Promise<APIGatewayProxyResult> {
  return (await handler(makeEvent(playerId, body), ctx, cb)) as APIGatewayProxyResult;
}

interface Fixture {
  playerId: string;
  youngBoysId: string;
  rawId: string;
  ncId: string;
  track: ProgressionTrack;
}

async function seed(): Promise<Fixture> {
  const repos = state.repos;
  const youngBoys = await repos.leagueOps.divisions.create({ name: 'Young Boys', isDevelopmental: true });
  const nc = await repos.leagueOps.divisions.create({ name: 'NXT', isDevelopmental: true });
  const raw = await repos.leagueOps.divisions.create({ name: 'Raw' });
  const player = await repos.roster.players.create({
    name: 'Kenta',
    currentWrestler: 'Kenta',
    divisionId: youngBoys.divisionId,
    divisionJoinedAt: '2026-01-01T00:00:00.000Z',
  });
  await repos.roster.players.update(player.playerId, { userId: 'user-kenta' });
  const track: ProgressionTrack = {
    trackId: 't-callup',
    kind: 'callup',
    name: 'Young Boys call-up',
    fromDivisionId: youngBoys.divisionId,
    toDivisionId: raw.divisionId,
    goals: [],
    windowMode: 'allTime',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  await repos.progression.putTrack(track);
  await repos.progression.upsertPlayerProgression({
    playerId: player.playerId,
    trackId: track.trackId,
    progressPct: 100,
    goals: [],
    computedAt: '2026-11-01T00:00:00.000Z',
  });
  return { playerId: player.playerId, youngBoysId: youngBoys.divisionId, rawId: raw.divisionId, ncId: nc.divisionId, track };
}

describe('executeProgression', () => {
  let fx: Fixture;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockInvokeAsync.mockResolvedValue(undefined);
    state.repos = buildInMemoryRepositories();
    fx = await seed();
  });

  it('moves the player, deletes the track row, records the event and runs follow-ups', async () => {
    const res = await call(fx.playerId, { trackId: fx.track.trackId, announce: true });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({
      playerId: fx.playerId,
      trackId: fx.track.trackId,
      kind: 'callup',
      fromDivisionId: fx.youngBoysId,
      toDivisionId: fx.rawId,
      event: { type: 'executed', actorUserId: 'sub-gm' },
    });
    expect(body.announcementId).toEqual(expect.any(String));

    const player = await state.repos.roster.players.findById(fx.playerId);
    expect(player?.divisionId).toBe(fx.rawId);
    expect(player?.divisionJoinedAt).toBe(body.divisionJoinedAt);
    expect(await state.repos.progression.getPlayerProgression(fx.playerId, fx.track.trackId)).toBeNull();

    const events = await state.repos.progression.listEvents(fx.playerId);
    expect(events.map((e) => e.type)).toEqual(['executed']);

    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-kenta',
      type: 'progression_executed',
      sourceType: 'progression',
      message: 'You have been called up to Raw!',
    }));
    const [announcement] = await state.repos.content.announcements.list();
    expect(announcement.title).toBe('Kenta has been called up to Raw!');

    expect(mockInvokeAsync).toHaveBeenCalledWith('progression', { playerIds: [fx.playerId] });
    expect(mockInvokeAsync).toHaveBeenCalledWith('contenders', { source: 'progressionExecute' });
  });

  it('stages the division move, row delete and both events in one transaction', async () => {
    await state.repos.progression.setConsideration(fx.playerId, fx.track.trackId, {
      status: 'considering', markedBy: 'sub-gm', markedAt: '2026-11-10T00:00:00.000Z',
    });
    const calls: Array<[string, unknown[]]> = [];
    const realRun = state.repos.runInTransaction;
    state.repos.runInTransaction = (fn) =>
      realRun((tx) => {
        const recorder = new Proxy(tx, {
          get(target, prop: keyof UnitOfWork) {
            const value = target[prop];
            if (typeof value !== 'function') return value;
            return (...args: unknown[]) => {
              calls.push([String(prop), args]);
              return (value as (...a: unknown[]) => unknown).apply(target, args);
            };
          },
        });
        return fn(recorder);
      });

    const res = await call(fx.playerId, { trackId: fx.track.trackId });
    expect(res.statusCode).toBe(200);

    expect(calls.map(([name]) => name)).toEqual([
      'updatePlayer',
      'deletePlayerProgression',
      'appendProgressionEvent',
      'appendProgressionEvent',
    ]);
    expect(calls[0][1]).toEqual([fx.playerId, { divisionId: fx.rawId, divisionJoinedAt: expect.any(String) }]);
    expect(calls[1][1]).toEqual([fx.playerId, fx.track.trackId]);
    expect((calls[2][1][0] as { type: string }).type).toBe('consideration_removed');
    expect((calls[3][1][0] as { type: string }).type).toBe('executed');

    const events = await state.repos.progression.listEvents(fx.playerId);
    expect(events.map((e) => e.type).sort()).toEqual(['consideration_removed', 'executed']);
  });

  it('returns 409 NOT_IN_SOURCE_DIVISION when the player is in another division', async () => {
    await state.repos.roster.players.update(fx.playerId, { divisionId: fx.rawId });

    const res = await call(fx.playerId, { trackId: fx.track.trackId });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('NOT_IN_SOURCE_DIVISION');
    expect(mockInvokeAsync).not.toHaveBeenCalled();
  });

  it('returns 409 HOLDS_DIVISION_TITLE unless forced', async () => {
    const title = await state.repos.competition.championships.create({
      name: 'Young Boys Title', type: 'singles', divisionId: fx.youngBoysId, currentChampion: fx.playerId,
    });
    await state.repos.competition.championships.create({
      name: 'Open Title', type: 'singles', currentChampion: fx.playerId,
    });

    const blocked = await call(fx.playerId, { trackId: fx.track.trackId });
    expect(blocked.statusCode).toBe(409);
    expect(JSON.parse(blocked.body)).toMatchObject({
      code: 'HOLDS_DIVISION_TITLE',
      championships: [{ championshipId: title.championshipId, name: 'Young Boys Title' }],
    });
    expect((await state.repos.roster.players.findById(fx.playerId))?.divisionId).toBe(fx.youngBoysId);

    const forced = await call(fx.playerId, { trackId: fx.track.trackId, force: true });
    expect(forced.statusCode).toBe(200);
    expect((await state.repos.roster.players.findById(fx.playerId))?.divisionId).toBe(fx.rawId);
  });

  it('refuses a developmental target for a call-up', async () => {
    const res = await call(fx.playerId, { trackId: fx.track.trackId, toDivisionId: fx.ncId });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('TARGET_IS_DEVELOPMENTAL');
  });

  it('allows a developmental target for other kinds', async () => {
    await state.repos.progression.putTrack({ ...fx.track, trackId: 't-rel', kind: 'relegation', toDivisionId: fx.ncId });

    const res = await call(fx.playerId, { trackId: 't-rel' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).kind).toBe('relegation');
  });

  it('requires toDivisionId when the track has none', async () => {
    await state.repos.progression.putTrack({ ...fx.track, toDivisionId: undefined });

    expect((await call(fx.playerId, { trackId: fx.track.trackId })).statusCode).toBe(400);
    const res = await call(fx.playerId, { trackId: fx.track.trackId, toDivisionId: fx.rawId });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 for an unknown track, player or target division', async () => {
    expect((await call(fx.playerId, { trackId: 'nope' })).statusCode).toBe(404);
    expect((await call('nobody', { trackId: fx.track.trackId })).statusCode).toBe(404);
    expect((await call(fx.playerId, { trackId: fx.track.trackId, toDivisionId: 'gone' })).statusCode).toBe(404);
  });

  it('validates the body', async () => {
    expect((await call(fx.playerId, {})).statusCode).toBe(400);
    expect((await call(fx.playerId, { trackId: fx.track.trackId, announce: 'yes' })).statusCode).toBe(400);
  });

  it('still succeeds when the follow-ups fail', async () => {
    mockInvokeAsync.mockRejectedValue(new Error('throttled'));
    mockCreateNotification.mockRejectedValue(new Error('down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await call(fx.playerId, { trackId: fx.track.trackId });

    expect(res.statusCode).toBe(200);
    expect((await state.repos.roster.players.findById(fx.playerId))?.divisionId).toBe(fx.rawId);
    errorSpy.mockRestore();
  });
});
