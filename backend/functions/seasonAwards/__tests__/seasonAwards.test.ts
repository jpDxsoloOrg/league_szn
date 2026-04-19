import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const {
  mockSeasonAwardsListBySeason,
  mockSeasonAwardsFindById,
  mockSeasonAwardsCreate,
  mockSeasonAwardsDelete,
  mockMatchesList,
  mockPlayersList,
  mockPlayersFind,
  mockChampionshipsListAllHistory,
  mockSeasonsFindById,
} = vi.hoisted(() => ({
  mockSeasonAwardsListBySeason: vi.fn(),
  mockSeasonAwardsFindById: vi.fn(),
  mockSeasonAwardsCreate: vi.fn(),
  mockSeasonAwardsDelete: vi.fn(),
  mockMatchesList: vi.fn(),
  mockPlayersList: vi.fn(),
  mockPlayersFind: vi.fn(),
  mockChampionshipsListAllHistory: vi.fn(),
  mockSeasonsFindById: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    season: {
      awards: {
      listBySeason: mockSeasonAwardsListBySeason,
      findById: mockSeasonAwardsFindById,
      create: mockSeasonAwardsCreate,
      delete: mockSeasonAwardsDelete,
    },
      seasons: {
      findById: mockSeasonsFindById,
    },
    },
    competition: {
      matches: {
      list: mockMatchesList,
    },
      championships: {
      listAllHistory: mockChampionshipsListAllHistory,
    },
    },
    roster: {
      players: {
      list: mockPlayersList,
      findById: mockPlayersFind,
    },
    },
  }),
}));

vi.mock('uuid', () => ({
  v4: () => 'test-award-uuid',
}));

import { handler as getSeasonAwards } from '../getSeasonAwards';
import { handler as createSeasonAward } from '../createSeasonAward';
import { handler as deleteSeasonAward } from '../deleteSeasonAward';
import { handler as routerHandler } from '../handler';

// ─── Helpers ─────────────────────────────────────────────────────────

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

// ─── getSeasonAwards ────────────────────────────────────────────────

describe('getSeasonAwards', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns auto and custom awards for a season', async () => {
    mockSeasonAwardsListBySeason.mockResolvedValue([
      { awardId: 'custom-1', seasonId: 's1', name: 'Best Promo', awardType: 'custom', playerId: 'p1' },
    ]);
    mockMatchesList.mockResolvedValue([
      { matchId: 'm1', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], status: 'completed', date: '2024-01-01' },
      { matchId: 'm2', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], status: 'completed', date: '2024-01-02' },
      { matchId: 'm3', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], status: 'completed', date: '2024-01-03' },
    ]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Player One' },
      { playerId: 'p2', name: 'Player Two' },
    ]);
    mockChampionshipsListAllHistory.mockResolvedValue([]);

    const event = makeEvent({ pathParameters: { seasonId: 's1' } });
    const result = await getSeasonAwards(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.seasonId).toBe('s1');
    expect(body.customAwards).toHaveLength(1);
    expect(body.autoAwards.length).toBeGreaterThan(0);

    // MVP should be p1 with 3 wins
    const mvp = body.autoAwards.find((a: Record<string, string>) => a.awardType === 'mvp');
    expect(mvp).toBeDefined();
    expect(mvp.playerId).toBe('p1');
    expect(mvp.value).toBe('3 wins');
  });

  it('returns 400 when seasonId is missing', async () => {
    const event = makeEvent({ pathParameters: null });
    const result = await getSeasonAwards(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
  });

  it('returns 500 when repository throws', async () => {
    mockSeasonAwardsListBySeason.mockRejectedValue(new Error('DB failure'));

    const event = makeEvent({ pathParameters: { seasonId: 's1' } });
    const result = await getSeasonAwards(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch season awards');
  });
});

// ─── createSeasonAward ──────────────────────────────────────────────

describe('createSeasonAward', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a custom award and returns 201', async () => {
    mockSeasonsFindById.mockResolvedValue({ seasonId: 's1', name: 'Season 1' });
    mockPlayersFind.mockResolvedValue({ playerId: 'p1', name: 'Player One' });
    mockSeasonAwardsCreate.mockResolvedValue({
      awardId: 'test-award-uuid',
      seasonId: 's1',
      name: 'Best Promo',
      awardType: 'custom',
      playerId: 'p1',
      playerName: 'Player One',
      description: 'Great mic work',
    });

    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      body: JSON.stringify({ name: 'Best Promo', playerId: 'p1', description: 'Great mic work' }),
    });

    const result = await createSeasonAward(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.awardId).toBe('test-award-uuid');
    expect(body.name).toBe('Best Promo');
    expect(body.playerId).toBe('p1');
    expect(body.playerName).toBe('Player One');
    expect(body.awardType).toBe('custom');
    expect(body.description).toBe('Great mic work');
    expect(mockSeasonAwardsCreate).toHaveBeenCalledOnce();
  });

  it('returns 400 when name is missing', async () => {
    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      body: JSON.stringify({ playerId: 'p1' }),
    });

    const result = await createSeasonAward(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('name is required');
  });

  it('returns 400 when playerId is missing', async () => {
    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      body: JSON.stringify({ name: 'MVP' }),
    });

    const result = await createSeasonAward(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('playerId is required');
  });

  it('returns 404 when season not found', async () => {
    mockSeasonsFindById.mockResolvedValue(null);

    const event = makeEvent({
      pathParameters: { seasonId: 's999' },
      body: JSON.stringify({ name: 'MVP', playerId: 'p1' }),
    });

    const result = await createSeasonAward(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Season not found');
  });

  it('returns 404 when player not found', async () => {
    mockSeasonsFindById.mockResolvedValue({ seasonId: 's1' });
    mockPlayersFind.mockResolvedValue(null);

    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      body: JSON.stringify({ name: 'MVP', playerId: 'p999' }),
    });

    const result = await createSeasonAward(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Player not found');
  });

  it('returns 400 when body is null', async () => {
    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      body: null,
    });

    const result = await createSeasonAward(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
  });
});

// ─── deleteSeasonAward ──────────────────────────────────────────────

describe('deleteSeasonAward', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes an award and returns 204', async () => {
    mockSeasonAwardsFindById.mockResolvedValue({
      seasonId: 's1', awardId: 'a1', name: 'MVP',
    });
    mockSeasonAwardsDelete.mockResolvedValue(undefined);

    const event = makeEvent({
      pathParameters: { seasonId: 's1', awardId: 'a1' },
      httpMethod: 'DELETE',
    });

    const result = await deleteSeasonAward(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    expect(mockSeasonAwardsDelete).toHaveBeenCalledWith('s1', 'a1');
  });

  it('returns 404 when award not found', async () => {
    mockSeasonAwardsFindById.mockResolvedValue(null);

    const event = makeEvent({
      pathParameters: { seasonId: 's1', awardId: 'a999' },
      httpMethod: 'DELETE',
    });

    const result = await deleteSeasonAward(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
  });

  it('returns 400 when seasonId is missing', async () => {
    const event = makeEvent({
      pathParameters: { awardId: 'a1' },
      httpMethod: 'DELETE',
    });

    const result = await deleteSeasonAward(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
  });

  it('returns 400 when awardId is missing', async () => {
    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      httpMethod: 'DELETE',
    });

    const result = await deleteSeasonAward(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
  });
});

// ─── handler (router) ───────────────────────────────────────────────

describe('handler (router)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes GET to getSeasonAwards', async () => {
    mockSeasonAwardsListBySeason.mockResolvedValue([]);
    mockMatchesList.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([]);
    mockChampionshipsListAllHistory.mockResolvedValue([]);

    const event = makeEvent({
      httpMethod: 'GET',
      pathParameters: { seasonId: 's1' },
    });

    const result = await routerHandler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
  });

  it('routes DELETE to deleteSeasonAward', async () => {
    mockSeasonAwardsFindById.mockResolvedValue({ seasonId: 's1', awardId: 'a1' });
    mockSeasonAwardsDelete.mockResolvedValue(undefined);

    const event = makeEvent({
      httpMethod: 'DELETE',
      pathParameters: { seasonId: 's1', awardId: 'a1' },
    });

    const result = await routerHandler(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
  });

  it('returns 405 for unsupported methods', async () => {
    const event = makeEvent({
      httpMethod: 'PATCH',
      pathParameters: { seasonId: 's1' },
    });

    const result = await routerHandler(event, ctx, cb);

    expect(result!.statusCode).toBe(405);
  });
});
