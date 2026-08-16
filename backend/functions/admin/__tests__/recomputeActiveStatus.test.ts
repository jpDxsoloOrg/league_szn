import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as recomputeActiveStatus } from '../recomputeActiveStatus';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function adminEvent(): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/admin/recompute-active-status',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      authorizer: { groups: 'Admin', username: 'admin', principalId: 'sub-1' },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

describe('recomputeActiveStatus', () => {
  it('marks participants of completed season matches active and clears the rest', async () => {
    const season = await repos.season.seasons.create({ name: 'S1', startDate: '2026-01-01' });
    const competed = await repos.roster.players.create({ name: 'A', currentWrestler: 'W1' });
    const idle = await repos.roster.players.create({ name: 'B', currentWrestler: 'W2' });
    // Stale flag from a deleted match — the recompute is what walks it back.
    await repos.roster.players.update(idle.playerId, { lastActiveSeasonId: season.seasonId });

    await repos.competition.matches.create({
      date: '2026-02-01',
      matchType: 'singles',
      participants: [competed.playerId],
      status: 'completed',
      seasonId: season.seasonId,
    });

    const result = await recomputeActiveStatus(adminEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toMatchObject({ seasonId: season.seasonId, marked: 1, cleared: 1 });

    expect((await repos.roster.players.findById(competed.playerId))!.lastActiveSeasonId).toBe(
      season.seasonId,
    );
    // Cleared fields round-trip as null (DynamoDB NULL), which reads as inactive.
    expect((await repos.roster.players.findById(idle.playerId))!.lastActiveSeasonId).toBeFalsy();
  });

  it('ignores scheduled matches and matches from other seasons', async () => {
    const season = await repos.season.seasons.create({ name: 'S1', startDate: '2026-01-01' });
    const scheduledOnly = await repos.roster.players.create({ name: 'A', currentWrestler: 'W1' });
    const otherSeason = await repos.roster.players.create({ name: 'B', currentWrestler: 'W2' });

    await repos.competition.matches.create({
      date: '2026-02-01',
      matchType: 'singles',
      participants: [scheduledOnly.playerId],
      status: 'scheduled',
      seasonId: season.seasonId,
    });
    await repos.competition.matches.create({
      date: '2025-02-01',
      matchType: 'singles',
      participants: [otherSeason.playerId],
      status: 'completed',
      seasonId: 'other-season',
    });

    const result = await recomputeActiveStatus(adminEvent(), ctx, cb);

    expect(JSON.parse(result!.body).marked).toBe(0);
    expect(
      (await repos.roster.players.findById(scheduledOnly.playerId))!.lastActiveSeasonId,
    ).toBeFalsy();
  });

  it('leaves admin overrides untouched', async () => {
    const season = await repos.season.seasons.create({ name: 'S1', startDate: '2026-01-01' });
    const forced = await repos.roster.players.create({ name: 'A', currentWrestler: 'W1' });
    const override = {
      seasonId: season.seasonId,
      value: true,
      setBy: 'admin',
      setAt: '2026-01-02T00:00:00.000Z',
    };
    await repos.roster.players.update(forced.playerId, { activeOverride: override });

    await recomputeActiveStatus(adminEvent(), ctx, cb);

    expect((await repos.roster.players.findById(forced.playerId))!.activeOverride).toEqual(override);
  });

  it('returns 409 when there is no active season', async () => {
    const result = await recomputeActiveStatus(adminEvent(), ctx, cb);

    expect(result!.statusCode).toBe(409);
  });
});
