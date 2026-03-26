import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockPut, mockUpdate, mockDelete, mockScanAll } = vi.hoisted(() => ({
  mockPut: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockScanAll: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: vi.fn(), put: mockPut, scan: vi.fn(), query: vi.fn(),
    update: mockUpdate, delete: mockDelete, scanAll: mockScanAll, queryAll: vi.fn(),
  },
  TableNames: {
    SITE_CONFIG: 'SiteConfig', PLAYERS: 'Players', DIVISIONS: 'Divisions',
    CHAMPIONSHIPS: 'Championships', CHAMPIONSHIP_HISTORY: 'ChampionshipHistory',
    SEASON_STANDINGS: 'SeasonStandings', SEASONS: 'Seasons', MATCHES: 'Matches',
    TOURNAMENTS: 'Tournaments', EVENTS: 'Events', CONTENDER_RANKINGS: 'ContenderRankings',
    RANKING_HISTORY: 'RankingHistory', FANTASY_CONFIG: 'FantasyConfig',
    WRESTLER_COSTS: 'WrestlerCosts', FANTASY_PICKS: 'FantasyPicks',
    CHALLENGES: 'Challenges', PROMOS: 'Promos',
    CONTENDER_OVERRIDES: 'ContenderOverrides',
    STABLES: 'Stables', TAG_TEAMS: 'TagTeams', STABLE_INVITATIONS: 'StableInvitations',
  },
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
    mockPut.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});

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

    // Verify put was called many times for all entity inserts
    expect(mockPut.mock.calls.length).toBeGreaterThan(90);
  });

  it('returns 500 when DynamoDB throws during seeding', async () => {
    mockPut.mockRejectedValue(new Error('DynamoDB write error'));

    const result = await seedData(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to seed data');
  });

  it('accepts optional body with modules array and still runs full seed (until modular seed exists)', async () => {
    mockPut.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});

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
    mockPut.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});

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

  it('returns 500 when body has only invalid module IDs', async () => {
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
    mockScanAll.mockResolvedValue([{ playerId: 'p1' }, { playerId: 'p2' }]);
    mockDelete.mockResolvedValue({});
    const event = withAuth(makeEvent(), 'Admin');

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.message).toBe('All data cleared successfully');
    expect(mockDelete).toHaveBeenCalledTimes(28); // 14 tables * 2 items

    const labels = ['players', 'matches', 'championships', 'championshipHistory',
      'tournaments', 'seasons', 'seasonStandings', 'divisions', 'events',
      'contenderRankings', 'contenderOverrides', 'rankingHistory', 'challenges', 'promos'];
    for (const label of labels) {
      expect(body.deletedCounts[label]).toBe(2);
    }
  });

  it('returns zero counts when all tables are empty', async () => {
    mockScanAll.mockResolvedValue([]);

    const event = withAuth(makeEvent(), 'Admin');

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.message).toBe('All data cleared successfully');
    expect(body.deletedCounts.players).toBe(0);
    expect(body.deletedCounts.matches).toBe(0);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('reports error counts when individual deletes fail', async () => {
    mockScanAll.mockResolvedValue([{ playerId: 'p1' }, { playerId: 'p2' }, { playerId: 'p3' }]);
    let callIndex = 0;
    mockDelete.mockImplementation(() => {
      callIndex++;
      if (callIndex % 3 === 2) {
        return Promise.reject(new Error('Throttled'));
      }
      return Promise.resolve({});
    });

    const event = withAuth(makeEvent(), 'Admin');

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.message).toContain('error(s)');
    expect(body.errorCounts).toBeDefined();
  });

  it('uses sort keys for tables that have composite keys', async () => {
    mockScanAll.mockResolvedValue([{ matchId: 'm1', date: '2024-01-01' }]);
    mockDelete.mockResolvedValue({});
    const event = withAuth(makeEvent(), 'Admin');

    await clearAll(event, ctx, cb);

    const deleteCallsArgs = mockDelete.mock.calls.map(c => c[0]);
    const matchesDelete = deleteCallsArgs.find((a: any) => a.TableName === 'Matches');
    if (matchesDelete) {
      expect(matchesDelete.Key).toHaveProperty('matchId');
      expect(matchesDelete.Key).toHaveProperty('date');
    }
  });

  it('returns 500 when scanAll throws a top-level error', async () => {
    mockScanAll.mockRejectedValue(new Error('DynamoDB scan error'));

    const event = withAuth(makeEvent(), 'Admin');

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to clear all data');
  });

  it('uses ExpressionAttributeNames to handle reserved words in scan', async () => {
    mockScanAll.mockResolvedValue([]);
    const event = withAuth(makeEvent(), 'Admin');

    await clearAll(event, ctx, cb);

    const scanCalls = mockScanAll.mock.calls;
    expect(scanCalls.length).toBe(14);
    for (const call of scanCalls) {
      expect(call[0].ExpressionAttributeNames).toHaveProperty('#pk');
      expect(call[0].ProjectionExpression).toContain('#pk');
    }
    // Tables with sort keys also have '#sk'
    const matchesScan = scanCalls.find((c: any) => c[0].TableName === 'Matches');
    if (matchesScan) {
      expect(matchesScan[0].ExpressionAttributeNames).toHaveProperty('#sk');
      expect(matchesScan[0].ProjectionExpression).toContain('#sk');
    }
  });
});
