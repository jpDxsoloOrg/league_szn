import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const mockClearAllData = vi.fn();
const mockExportAllData = vi.fn();
const mockImportAllData = vi.fn();

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    clearAllData: mockClearAllData,
    exportAllData: mockExportAllData,
    importAllData: mockImportAllData,
  }),
}));

const { mockUuidV4 } = vi.hoisted(() => {
  let counter = 0;
  return {
    mockUuidV4: vi.fn(() => `test-uuid-${++counter}`),
  };
});

vi.mock('uuid', () => ({
  v4: mockUuidV4,
}));

import { handler as seedData } from '../seedData';
import { handler as clearAll } from '../clearAll';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

function withAuth(event: APIGatewayProxyEvent, groups: string, sub = 'user-sub-1'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: sub },
    } as any,
  };
}

// ─── seedData ───────────────────────────────────────────────────────

describe('seedData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('seeds all sample data and returns created counts', async () => {
    mockImportAllData.mockResolvedValue({
      divisions: 3, players: 12, seasons: 1, seasonStandings: 12,
      championships: 4, championshipHistory: 4, matches: 12, tournaments: 2,
      events: 3, contenderRankings: 8, rankingHistory: 9,
      fantasyConfig: 1, wrestlerCosts: 12, challenges: 6, promos: 7, siteConfig: 1,
    });

    const result = await seedData(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.message).toBe('Sample data seeded successfully!');

    // Verify all expected categories have counts
    expect(body.createdCounts.divisions).toBe(3);
    expect(body.createdCounts.players).toBe(12);
    expect(body.createdCounts.seasons).toBe(1);
    expect(body.createdCounts.seasonStandings).toBe(12);
    expect(body.createdCounts.championships).toBe(4);
    expect(body.createdCounts.championshipHistory).toBe(4);
    expect(body.createdCounts.matches).toBe(12);
    expect(body.createdCounts.tournaments).toBe(2);
    expect(body.createdCounts.events).toBe(3);
    expect(body.createdCounts.contenderRankings).toBe(8);
    expect(body.createdCounts.rankingHistory).toBe(9);
    expect(body.createdCounts.fantasyConfig).toBe(1);
    expect(body.createdCounts.wrestlerCosts).toBe(12);
    expect(body.createdCounts.challenges).toBe(6);
    expect(body.createdCounts.promos).toBe(7);
    expect(body.createdCounts.siteConfig).toBe(1);

    // Verify importAllData was called with data
    expect(mockImportAllData).toHaveBeenCalledOnce();
    const importData = mockImportAllData.mock.calls[0][0];
    expect(importData.divisions).toHaveLength(3);
    expect(importData.players).toHaveLength(12);
  });

  it('returns 500 when importAllData throws', async () => {
    mockImportAllData.mockRejectedValue(new Error('write error'));

    const result = await seedData(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to seed data');
  });

  it('accepts optional body with modules array and still runs full seed', async () => {
    mockImportAllData.mockResolvedValue({
      divisions: 3, players: 12, seasons: 1, seasonStandings: 12,
      championships: 4, championshipHistory: 4, matches: 12, tournaments: 2,
      events: 3, contenderRankings: 8, rankingHistory: 9,
      fantasyConfig: 1, wrestlerCosts: 12, challenges: 6, promos: 7, siteConfig: 1,
    });

    const result = await seedData(
      makeEvent({ body: '{"modules":["core"]}' }),
      ctx,
      cb
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.createdCounts.divisions).toBe(3);
    expect(body.createdCounts.players).toBe(12);
  });

  it('runs full seed when body is empty or modules array is empty', async () => {
    mockImportAllData.mockResolvedValue({
      divisions: 3, players: 12, seasons: 1, seasonStandings: 12,
      championships: 4, championshipHistory: 4, matches: 12, tournaments: 2,
      events: 3, contenderRankings: 8, rankingHistory: 9,
      fantasyConfig: 1, wrestlerCosts: 12, challenges: 6, promos: 7, siteConfig: 1,
    });

    const resultEmptyBody = await seedData(makeEvent({ body: '{}' }), ctx, cb);
    expect(resultEmptyBody!.statusCode).toBe(200);
    expect(JSON.parse(resultEmptyBody!.body).createdCounts.players).toBe(12);

    const resultEmptyModules = await seedData(
      makeEvent({ body: '{"modules":[]}' }),
      ctx,
      cb
    );
    expect(resultEmptyModules!.statusCode).toBe(200);
    expect(JSON.parse(resultEmptyModules!.body).createdCounts.players).toBe(12);
  });

  it('returns 400 when body has only invalid module IDs', async () => {
    const result = await seedData(
      makeEvent({ body: '{"modules":["unknown-module"]}' }),
      ctx,
      cb
    );
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(/Invalid|unknown/i);
  });
});

// ─── clearAll ───────────────────────────────────────────────────────

describe('clearAll', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when user has no auth groups', async () => {
    const event = makeEvent();

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toContain('Admin privileges');
  });

  it('returns 403 when user is Moderator (not full Admin)', async () => {
    const event = withAuth(makeEvent(), 'Moderator');

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toContain('Admin privileges');
  });

  it('returns 403 when user is Wrestler role', async () => {
    const event = withAuth(makeEvent(), 'Wrestler');

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
  });

  it('clears all tables and returns deleted counts when Admin', async () => {
    mockClearAllData.mockResolvedValue({
      players: { deleted: 2, errors: 0 },
      matches: { deleted: 2, errors: 0 },
      championships: { deleted: 2, errors: 0 },
      championshipHistory: { deleted: 2, errors: 0 },
      tournaments: { deleted: 2, errors: 0 },
      seasons: { deleted: 2, errors: 0 },
      seasonStandings: { deleted: 2, errors: 0 },
      divisions: { deleted: 2, errors: 0 },
      events: { deleted: 2, errors: 0 },
      contenderRankings: { deleted: 2, errors: 0 },
      contenderOverrides: { deleted: 2, errors: 0 },
      rankingHistory: { deleted: 2, errors: 0 },
      challenges: { deleted: 2, errors: 0 },
      promos: { deleted: 2, errors: 0 },
    });
    const event = withAuth(makeEvent(), 'Admin');

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.message).toBe('All data cleared successfully');
    expect(mockClearAllData).toHaveBeenCalledOnce();

    const labels = ['players', 'matches', 'championships', 'championshipHistory',
      'tournaments', 'seasons', 'seasonStandings', 'divisions', 'events',
      'contenderRankings', 'contenderOverrides', 'rankingHistory', 'challenges', 'promos'];
    for (const label of labels) {
      expect(body.deletedCounts[label]).toBe(2);
    }
  });

  it('returns zero counts when all tables are empty', async () => {
    mockClearAllData.mockResolvedValue({
      players: { deleted: 0, errors: 0 },
      matches: { deleted: 0, errors: 0 },
    });

    const event = withAuth(makeEvent(), 'Admin');

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.message).toBe('All data cleared successfully');
    expect(body.deletedCounts.players).toBe(0);
    expect(body.deletedCounts.matches).toBe(0);
  });

  it('reports error counts when individual deletes fail', async () => {
    mockClearAllData.mockResolvedValue({
      players: { deleted: 2, errors: 1 },
      matches: { deleted: 3, errors: 0 },
    });

    const event = withAuth(makeEvent(), 'Admin');

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.message).toContain('error(s)');
    expect(body.errorCounts).toBeDefined();
    expect(body.errorCounts.players).toBe(1);
  });

  it('returns 500 when clearAllData throws', async () => {
    mockClearAllData.mockRejectedValue(new Error('scan error'));

    const event = withAuth(makeEvent(), 'Admin');

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to clear all data');
  });
});
