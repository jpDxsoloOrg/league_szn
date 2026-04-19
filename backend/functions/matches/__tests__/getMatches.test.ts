import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';

import { handler as getMatches } from '../getMatches';

// ---- Helpers ---------------------------------------------------------------

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

// ---- Tests -----------------------------------------------------------------

describe('getMatches', () => {
  it('returns all matches sorted by date descending', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01T00:00:00Z', status: 'completed',
      participants: [], createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm3', date: '2024-03-01T00:00:00Z', status: 'scheduled',
      participants: [], createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-02-01T00:00:00Z', status: 'completed',
      participants: [], createdAt: new Date().toISOString(),
    });

    const result = await getMatches(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(3);
    expect(body[0].matchId).toBe('m3');
    expect(body[1].matchId).toBe('m2');
    expect(body[2].matchId).toBe('m1');
  });

  it('returns empty array when no matches exist', async () => {
    const result = await getMatches(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([]);
  });

  it('filters by status query parameter', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01T00:00:00Z', status: 'scheduled',
      participants: [], createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-01-02T00:00:00Z', status: 'completed',
      participants: [], createdAt: new Date().toISOString(),
    });

    const event = makeEvent({
      queryStringParameters: { status: 'scheduled' },
    });

    const result = await getMatches(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(1);
    expect(body[0].matchId).toBe('m1');
  });

  it('returns all matches when no status parameter provided', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01T00:00:00Z', status: 'completed',
      participants: [], createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-01-02T00:00:00Z', status: 'scheduled',
      participants: [], createdAt: new Date().toISOString(),
    });

    const result = await getMatches(makeEvent(), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(2);
  });

  it('filters by playerId using contains on participants', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01T00:00:00Z', status: 'completed',
      participants: ['p1', 'p2'], createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-01-02T00:00:00Z', status: 'completed',
      participants: ['p3', 'p4'], createdAt: new Date().toISOString(),
    });

    const event = makeEvent({
      queryStringParameters: { playerId: 'p1' },
    });

    const result = await getMatches(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(1);
    expect(body[0].matchId).toBe('m1');
  });

  it('filters by matchType in-memory with normalized aliases', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01T00:00:00Z', matchFormat: 'singles',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-01-02T00:00:00Z', matchFormat: 'Tag Team',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });

    const event = makeEvent({
      queryStringParameters: { matchType: 'Singles' },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(1);
    expect(body[0].matchFormat).toBe('singles');
  });

  it('matches legacy tag values when filtering by Tag Team', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01T00:00:00Z', matchFormat: 'tag',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-01-02T00:00:00Z', matchFormat: 'tag team',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm3', date: '2024-01-03T00:00:00Z', matchFormat: 'Singles',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });

    const event = makeEvent({
      queryStringParameters: { matchType: 'Tag Team' },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(2);
    // Should include both tag variants, sorted by date desc
    expect(body[0].matchFormat).toBe('tag team');
    expect(body[1].matchFormat).toBe('tag');
  });

  it('matches tag aliases when query uses tag-team format', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01T00:00:00Z', matchFormat: 'tag',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-01-02T00:00:00Z', matchFormat: 'Tag Team',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm3', date: '2024-01-03T00:00:00Z', matchFormat: 'tag-team',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm4', date: '2024-01-04T00:00:00Z', matchFormat: 'Singles',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });

    const event = makeEvent({
      queryStringParameters: { matchType: 'tag-team' },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(3);
    // All tag variants included, sorted by date desc
    expect(body[0].matchFormat).toBe('tag-team');
    expect(body[1].matchFormat).toBe('Tag Team');
    expect(body[2].matchFormat).toBe('tag');
  });

  it('matches tag aliases when query uses tagteam format', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01T00:00:00Z', matchFormat: 'tagteam',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-01-02T00:00:00Z', matchFormat: 'tag-team',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm3', date: '2024-01-03T00:00:00Z', matchFormat: 'tag team',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm4', date: '2024-01-04T00:00:00Z', matchFormat: 'Singles',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });

    const event = makeEvent({
      queryStringParameters: { matchType: 'tagteam' },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(3);
    expect(body[0].matchFormat).toBe('tag team');
    expect(body[1].matchFormat).toBe('tag-team');
    expect(body[2].matchFormat).toBe('tagteam');
  });

  it('filters using legacy matchType field when matchFormat is missing', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01T00:00:00Z', matchType: 'singles',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    } as Record<string, unknown>);
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-01-02T00:00:00Z', matchType: 'tag',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    } as Record<string, unknown>);

    const event = makeEvent({
      queryStringParameters: { matchType: 'Singles' },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(1);
    expect(body[0].matchType).toBe('singles');
  });

  it('filters by stipulationId', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01T00:00:00Z', stipulationId: 'stip1',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-01-02T00:00:00Z', stipulationId: 'stip2',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });

    const event = makeEvent({
      queryStringParameters: { stipulationId: 'stip1' },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(1);
    expect(body[0].matchId).toBe('m1');
  });

  it('filters by championshipId', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01T00:00:00Z', championshipId: 'champ1',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-01-02T00:00:00Z', championshipId: 'champ2',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });

    const event = makeEvent({
      queryStringParameters: { championshipId: 'champ1' },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(1);
    expect(body[0].matchId).toBe('m1');
  });

  it('filters by seasonId', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01T00:00:00Z', seasonId: 's1',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-01-02T00:00:00Z', seasonId: 's2',
      participants: [], status: 'completed', createdAt: new Date().toISOString(),
    });

    const event = makeEvent({
      queryStringParameters: { seasonId: 's1' },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(1);
    expect(body[0].matchId).toBe('m1');
  });

  it('filters by dateFrom', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2023-12-31', participants: [],
      status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-01-01', participants: [],
      status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm3', date: '2024-06-01', participants: [],
      status: 'completed', createdAt: new Date().toISOString(),
    });

    const event = makeEvent({
      queryStringParameters: { dateFrom: '2024-01-01' },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(2);
    // Should include m2 and m3 (dates >= 2024-01-01)
    expect(body.map((m: { matchId: string }) => m.matchId).sort()).toEqual(['m2', 'm3']);
  });

  it('filters by dateTo', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-06-01', participants: [],
      status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-12-31', participants: [],
      status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm3', date: '2025-01-01', participants: [],
      status: 'completed', createdAt: new Date().toISOString(),
    });

    const event = makeEvent({
      queryStringParameters: { dateTo: '2024-12-31' },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(2);
    expect(body.map((m: { matchId: string }) => m.matchId).sort()).toEqual(['m1', 'm2']);
  });

  it('combines multiple filters with AND logic', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01T00:00:00Z', status: 'completed',
      participants: ['p1'], seasonId: 's1', matchFormat: 'singles',
      createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-01-02T00:00:00Z', status: 'completed',
      participants: ['p2'], seasonId: 's1', matchFormat: 'tag',
      createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm3', date: '2024-01-03T00:00:00Z', status: 'scheduled',
      participants: ['p1'], seasonId: 's1', matchFormat: 'singles',
      createdAt: new Date().toISOString(),
    });

    const event = makeEvent({
      queryStringParameters: {
        status: 'completed',
        playerId: 'p1',
        matchType: 'Singles',
        seasonId: 's1',
      },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    // Only m1 matches all criteria
    expect(body).toHaveLength(1);
    expect(body[0].matchId).toBe('m1');
  });

  it('combines dateFrom and dateTo into a range filter', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2023-12-31', participants: [],
      status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-06-15', participants: [],
      status: 'completed', createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm3', date: '2025-01-01', participants: [],
      status: 'completed', createdAt: new Date().toISOString(),
    });

    const event = makeEvent({
      queryStringParameters: {
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
      },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(1);
    expect(body[0].matchId).toBe('m2');
  });

  it('returns 500 when list throws', async () => {
    vi.spyOn(repos.competition.matches, 'list').mockRejectedValue(new Error('DB failure'));
    vi.spyOn(repos.competition.matches, 'listByStatus').mockRejectedValue(new Error('DB failure'));
    vi.spyOn(repos.competition.matches, 'listBySeason').mockRejectedValue(new Error('DB failure'));

    const result = await getMatches(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch matches');
  });
});
