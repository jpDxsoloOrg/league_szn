import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Mocks ----------------------------------------------------------------

const mockFantasyRepo = {
  getConfig: vi.fn(),
  upsertConfig: vi.fn(),
  findPick: vi.fn(),
  listPicksByEvent: vi.fn(),
  listPicksByUser: vi.fn(),
  listAllPicks: vi.fn(),
  savePick: vi.fn(),
  updatePickScoring: vi.fn(),
  deletePick: vi.fn(),
  findCost: vi.fn(),
  listAllCosts: vi.fn(),
  upsertCost: vi.fn(),
  initializeCost: vi.fn(),
};

const mockPlayersRepo = {
  findById: vi.fn(),
  list: vi.fn(),
};

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    fantasy: mockFantasyRepo,
    players: mockPlayersRepo,
  }),
}));

import { handler as getWrestlerCosts } from '../getWrestlerCosts';
import { handler as initializeWrestlerCosts } from '../initializeWrestlerCosts';
import { handler as updateWrestlerCost } from '../updateWrestlerCost';

// ---- Helpers ---------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};

const base: APIGatewayProxyEvent = {
  body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'GET',
  isBase64Encoded: false, path: '/', pathParameters: null,
  queryStringParameters: null, multiValueQueryStringParameters: null,
  stageVariables: null, resource: '', requestContext: { authorizer: {} } as any,
};
const makeEvent = (o: Partial<APIGatewayProxyEvent> = {}) => ({ ...base, ...o }) as APIGatewayProxyEvent;
const withAuth = (ev: APIGatewayProxyEvent, groups = 'Admin', sub = 'admin-1') => ({
  ...ev, requestContext: { ...ev.requestContext,
    authorizer: { groups, username: 'admin', email: 'admin@test.com', principalId: sub },
  } as any,
}) as APIGatewayProxyEvent;

// ---- getWrestlerCosts ------------------------------------------------------

describe('getWrestlerCosts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns merged player + cost data with trends', async () => {
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([{ playerId: 'p1', currentCost: 120, baseCost: 100, costHistory: [], winRate30Days: 60, recentRecord: '3-2', updatedAt: '2024-01-01' }]);
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1', name: 'Rock', currentWrestler: 'The Rock', divisionId: 'd1', imageUrl: 'img.png', updatedAt: '2024-01-01' }]);
    const result = await getWrestlerCosts(makeEvent(), ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ playerId: 'p1', currentCost: 120, baseCost: 100, costTrend: 'up', name: 'Rock', winRate30Days: 60, recentRecord: '3-2' });
  });

  it('returns default costs when player has no cost record', async () => {
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([]);
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1', name: 'Rock', currentWrestler: 'The Rock' }]);
    const result = await getWrestlerCosts(makeEvent(), ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body[0]).toMatchObject({ currentCost: 100, baseCost: 100, costTrend: 'stable', winRate30Days: 0, recentRecord: '0-0' });
  });

  it('calculates cost trend correctly: down', async () => {
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([{ playerId: 'p1', currentCost: 80, baseCost: 100 }]);
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1', name: 'Rock', currentWrestler: 'R' }]);
    const result = await getWrestlerCosts(makeEvent(), ctx, cb);
    expect(JSON.parse(result!.body)[0].costTrend).toBe('down');
  });

  it('calculates cost trend correctly: stable', async () => {
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([{ playerId: 'p1', currentCost: 100, baseCost: 100 }]);
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1', name: 'Rock', currentWrestler: 'R' }]);
    const result = await getWrestlerCosts(makeEvent(), ctx, cb);
    expect(JSON.parse(result!.body)[0].costTrend).toBe('stable');
  });

  it('returns empty array when no players exist', async () => {
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([]);
    mockPlayersRepo.list.mockResolvedValueOnce([]);

    const result = await getWrestlerCosts(makeEvent(), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([]);
  });

  it('returns 500 on error', async () => {
    mockFantasyRepo.listAllCosts.mockRejectedValueOnce(new Error('fail'));

    const result = await getWrestlerCosts(makeEvent(), ctx, cb);
    expect(result!.statusCode).toBe(500);
  });
});

// ---- initializeWrestlerCosts -----------------------------------------------

describe('initializeWrestlerCosts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when user lacks Admin role', async () => {
    const event = withAuth(makeEvent(), 'Fantasy');
    const result = await initializeWrestlerCosts(event, ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('initializes costs for players without existing costs', async () => {
    mockPlayersRepo.list.mockResolvedValueOnce([
      { playerId: 'p1', name: 'Rock' },
      { playerId: 'p2', name: 'Cena' },
    ]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([
      { playerId: 'p1', currentCost: 100 }, // already exists
    ]);
    mockFantasyRepo.initializeCost.mockResolvedValue({});

    const event = withAuth(makeEvent({ body: JSON.stringify({ baseCost: 100 }) }));
    const result = await initializeWrestlerCosts(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.initialized).toBe(1); // only p2
    expect(body.skipped).toBe(1); // p1
    expect(body.total).toBe(2);
    expect(mockFantasyRepo.initializeCost).toHaveBeenCalledOnce();
  });

  it('skips all players when all already have costs', async () => {
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1' }]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([{ playerId: 'p1', currentCost: 100 }]);

    const event = withAuth(makeEvent({ body: null }));
    const result = await initializeWrestlerCosts(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    expect(JSON.parse(result!.body).initialized).toBe(0);
    expect(mockFantasyRepo.initializeCost).not.toHaveBeenCalled();
  });

  it('uses default baseCost of 100 when not provided in body', async () => {
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1' }]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([]);
    mockFantasyRepo.initializeCost.mockResolvedValue({});

    const event = withAuth(makeEvent({ body: null }));
    await initializeWrestlerCosts(event, ctx, cb);

    expect(mockFantasyRepo.initializeCost).toHaveBeenCalledWith({ playerId: 'p1', baseCost: 100 });
  });

  it('uses custom baseCost from body', async () => {
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1' }]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([]);
    mockFantasyRepo.initializeCost.mockResolvedValue({});

    const event = withAuth(makeEvent({ body: JSON.stringify({ baseCost: 200 }) }));
    await initializeWrestlerCosts(event, ctx, cb);

    expect(mockFantasyRepo.initializeCost).toHaveBeenCalledWith({ playerId: 'p1', baseCost: 200 });
  });

  it('returns 500 on error', async () => {
    mockPlayersRepo.list.mockRejectedValueOnce(new Error('fail'));

    const event = withAuth(makeEvent());
    const result = await initializeWrestlerCosts(event, ctx, cb);
    expect(result!.statusCode).toBe(500);
  });
});

// ---- updateWrestlerCost ----------------------------------------------------

describe('updateWrestlerCost', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when user lacks Admin role', async () => {
    const ev = withAuth(makeEvent({ pathParameters: { playerId: 'p1' }, body: JSON.stringify({ currentCost: 150 }) }), 'Fantasy');
    expect((await updateWrestlerCost(ev, ctx, cb))!.statusCode).toBe(403);
  });

  it('returns 400 when playerId is missing', async () => {
    const ev = withAuth(makeEvent({ pathParameters: null, body: JSON.stringify({ currentCost: 150 }) }));
    expect(JSON.parse((await updateWrestlerCost(ev, ctx, cb))!.body).message).toBe('Player ID is required');
  });

  it('returns 400 when body is missing', async () => {
    const ev = withAuth(makeEvent({ pathParameters: { playerId: 'p1' }, body: null }));
    expect(JSON.parse((await updateWrestlerCost(ev, ctx, cb))!.body).message).toBe('Request body is required');
  });

  it('returns 400 when currentCost is not a positive number', async () => {
    const ev = withAuth(makeEvent({ pathParameters: { playerId: 'p1' }, body: JSON.stringify({ currentCost: -5 }) }));
    expect(JSON.parse((await updateWrestlerCost(ev, ctx, cb))!.body).message).toBe('currentCost must be a positive number');
  });

  it('returns 400 when currentCost is not a number', async () => {
    const ev = withAuth(makeEvent({ pathParameters: { playerId: 'p1' }, body: JSON.stringify({ currentCost: 'abc' }) }));
    expect((await updateWrestlerCost(ev, ctx, cb))!.statusCode).toBe(400);
  });

  it('returns 404 when wrestler cost not found', async () => {
    mockFantasyRepo.findCost.mockResolvedValueOnce(null);
    const ev = withAuth(makeEvent({ pathParameters: { playerId: 'p1' }, body: JSON.stringify({ currentCost: 150 }) }));
    expect(JSON.parse((await updateWrestlerCost(ev, ctx, cb))!.body).message).toContain('initialization');
  });

  it('updates cost and adds history entry', async () => {
    mockFantasyRepo.findCost.mockResolvedValueOnce({ playerId: 'p1', currentCost: 100, baseCost: 100, costHistory: [] });
    mockFantasyRepo.upsertCost.mockImplementationOnce((cost: Record<string, unknown>) => Promise.resolve(cost));
    const ev = withAuth(makeEvent({ pathParameters: { playerId: 'p1' }, body: JSON.stringify({ currentCost: 150, reason: 'Admin adjustment' }) }));
    const result = await updateWrestlerCost(ev, ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.currentCost).toBe(150);
    expect(body.costHistory).toHaveLength(1);
    expect(body.costHistory[0]).toMatchObject({ cost: 150, reason: 'Admin adjustment' });
  });

  it('uses default reason "Manual override" when not provided', async () => {
    mockFantasyRepo.findCost.mockResolvedValueOnce({ playerId: 'p1', currentCost: 100, costHistory: [] });
    mockFantasyRepo.upsertCost.mockImplementationOnce((cost: Record<string, unknown>) => Promise.resolve(cost));
    const ev = withAuth(makeEvent({ pathParameters: { playerId: 'p1' }, body: JSON.stringify({ currentCost: 200 }) }));
    const body = JSON.parse((await updateWrestlerCost(ev, ctx, cb))!.body);
    expect(body.costHistory[0].reason).toBe('Manual override');
  });

  it('trims cost history to last 20 entries', async () => {
    const longHistory = Array.from({ length: 20 }, (_, i) => ({ date: '2024-01-01', cost: 100 + i, reason: `Entry ${i}` }));
    mockFantasyRepo.findCost.mockResolvedValueOnce({ playerId: 'p1', currentCost: 100, costHistory: longHistory });
    mockFantasyRepo.upsertCost.mockImplementationOnce((cost: Record<string, unknown>) => Promise.resolve(cost));
    const ev = withAuth(makeEvent({ pathParameters: { playerId: 'p1' }, body: JSON.stringify({ currentCost: 250 }) }));
    const body = JSON.parse((await updateWrestlerCost(ev, ctx, cb))!.body);
    expect(body.costHistory).toHaveLength(20);
    expect(body.costHistory[0].reason).toBe('Entry 1');
    expect(body.costHistory[19].reason).toBe('Manual override');
  });

  it('returns 500 on unexpected error', async () => {
    mockFantasyRepo.findCost.mockRejectedValueOnce(new Error('fail'));
    const ev = withAuth(makeEvent({ pathParameters: { playerId: 'p1' }, body: JSON.stringify({ currentCost: 150 }) }));
    expect((await updateWrestlerCost(ev, ctx, cb))!.statusCode).toBe(500);
  });
});
