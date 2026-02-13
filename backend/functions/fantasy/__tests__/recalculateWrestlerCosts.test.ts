import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Mocks ----------------------------------------------------------------

const { mockGet, mockPut, mockScanAll } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockScanAll: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet,
    put: mockPut,
    scan: vi.fn(),
    query: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    scanAll: mockScanAll,
    queryAll: vi.fn(),
  },
  TableNames: {
    FANTASY_CONFIG: 'FantasyConfig',
    PLAYERS: 'Players',
    MATCHES: 'Matches',
    WRESTLER_COSTS: 'WrestlerCosts',
  },
}));

import { handler, recalculateCosts } from '../recalculateWrestlerCosts';

// ---- Helpers ---------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {},
    httpMethod: 'POST', isBase64Encoded: false, path: '/',
    pathParameters: null, queryStringParameters: null,
    multiValueQueryStringParameters: null, stageVariables: null,
    resource: '', requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

function withAuth(event: APIGatewayProxyEvent, groups = 'Admin'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'admin', email: 'a@t.com', principalId: 'admin-1' },
    } as any,
  };
}

// recent date helper: always within last 30 days
const recentDate = new Date().toISOString();

// ---- recalculateCosts (standalone function) --------------------------------

describe('recalculateCosts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing when costFluctuationEnabled is false', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { costFluctuationEnabled: false },
    });

    await recalculateCosts();

    expect(mockScanAll).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('calculates newCost = baseCost + (wins * costPerWin) - (losses * costPerLoss)', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { costFluctuationEnabled: true, costChangePerWin: 10, costChangePerLoss: 5 },
    });
    // Players
    mockScanAll.mockResolvedValueOnce([{ playerId: 'p1' }]);
    // Matches (recent completed)
    mockScanAll.mockResolvedValueOnce([
      { matchId: 'm1', status: 'completed', date: recentDate, winners: ['p1'], losers: ['p2'] },
      { matchId: 'm2', status: 'completed', date: recentDate, winners: ['p2'], losers: ['p1'] },
    ]);
    // Existing costs
    mockScanAll.mockResolvedValueOnce([
      { playerId: 'p1', baseCost: 100, currentCost: 100, costHistory: [] },
    ]);
    mockPut.mockResolvedValue({});

    await recalculateCosts();

    expect(mockPut).toHaveBeenCalledOnce();
    const item = mockPut.mock.calls[0][0].Item;
    // 100 + (1 * 10) - (1 * 5) = 105
    expect(item.currentCost).toBe(105);
    expect(item.winRate30Days).toBe(50);
    expect(item.recentRecord).toBe('1-1');
  });

  it('clamps cost at 50% of baseCost (lower bound)', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { costFluctuationEnabled: true, costChangePerWin: 5, costChangePerLoss: 100 },
    });
    mockScanAll.mockResolvedValueOnce([{ playerId: 'p1' }]);
    // 5 losses, 0 wins
    mockScanAll.mockResolvedValueOnce([
      { matchId: 'm1', status: 'completed', date: recentDate, winners: ['p2'], losers: ['p1'] },
      { matchId: 'm2', status: 'completed', date: recentDate, winners: ['p2'], losers: ['p1'] },
      { matchId: 'm3', status: 'completed', date: recentDate, winners: ['p2'], losers: ['p1'] },
      { matchId: 'm4', status: 'completed', date: recentDate, winners: ['p2'], losers: ['p1'] },
      { matchId: 'm5', status: 'completed', date: recentDate, winners: ['p2'], losers: ['p1'] },
    ]);
    mockScanAll.mockResolvedValueOnce([
      { playerId: 'p1', baseCost: 100, currentCost: 100, costHistory: [] },
    ]);
    mockPut.mockResolvedValue({});

    await recalculateCosts();

    // 100 + 0 - 500 = -400 => clamped to floor(100*0.5) = 50
    expect(mockPut.mock.calls[0][0].Item.currentCost).toBe(50);
  });

  it('clamps cost at 200% of baseCost (upper bound)', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { costFluctuationEnabled: true, costChangePerWin: 100, costChangePerLoss: 0 },
    });
    mockScanAll.mockResolvedValueOnce([{ playerId: 'p1' }]);
    // 10 wins
    const wins = Array.from({ length: 10 }, (_, i) => ({
      matchId: `m${i}`, status: 'completed', date: recentDate, winners: ['p1'], losers: ['p2'],
    }));
    mockScanAll.mockResolvedValueOnce(wins);
    mockScanAll.mockResolvedValueOnce([
      { playerId: 'p1', baseCost: 100, currentCost: 100, costHistory: [] },
    ]);
    mockPut.mockResolvedValue({});

    await recalculateCosts();

    // 100 + 1000 - 0 = 1100 => clamped to floor(100*2) = 200
    expect(mockPut.mock.calls[0][0].Item.currentCost).toBe(200);
  });

  it('adds history entry when cost changes', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { costFluctuationEnabled: true, costChangePerWin: 10, costChangePerLoss: 5 },
    });
    mockScanAll.mockResolvedValueOnce([{ playerId: 'p1' }]);
    mockScanAll.mockResolvedValueOnce([
      { matchId: 'm1', status: 'completed', date: recentDate, winners: ['p1'], losers: ['p2'] },
    ]);
    mockScanAll.mockResolvedValueOnce([
      { playerId: 'p1', baseCost: 100, currentCost: 100, costHistory: [] },
    ]);
    mockPut.mockResolvedValue({});

    await recalculateCosts();

    const item = mockPut.mock.calls[0][0].Item;
    // Cost changed from 100 to 110 => history entry added
    expect(item.currentCost).toBe(110);
    expect(item.costHistory).toHaveLength(1);
    expect(item.costHistory[0].cost).toBe(110);
    expect(item.costHistory[0].reason).toContain('1W-0L');
  });

  it('does not add history entry when cost stays the same', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { costFluctuationEnabled: true, costChangePerWin: 10, costChangePerLoss: 10 },
    });
    mockScanAll.mockResolvedValueOnce([{ playerId: 'p1' }]);
    // 1 win, 1 loss => net 0 change
    mockScanAll.mockResolvedValueOnce([
      { matchId: 'm1', status: 'completed', date: recentDate, winners: ['p1'], losers: ['p2'] },
      { matchId: 'm2', status: 'completed', date: recentDate, winners: ['p2'], losers: ['p1'] },
    ]);
    mockScanAll.mockResolvedValueOnce([
      { playerId: 'p1', baseCost: 100, currentCost: 100, costHistory: [] },
    ]);
    mockPut.mockResolvedValue({});

    await recalculateCosts();

    expect(mockPut.mock.calls[0][0].Item.costHistory).toHaveLength(0);
  });

  it('keeps only the last 20 cost history entries', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { costFluctuationEnabled: true, costChangePerWin: 10, costChangePerLoss: 5 },
    });
    mockScanAll.mockResolvedValueOnce([{ playerId: 'p1' }]);
    mockScanAll.mockResolvedValueOnce([
      { matchId: 'm1', status: 'completed', date: recentDate, winners: ['p1'], losers: ['p2'] },
    ]);
    const longHistory = Array.from({ length: 20 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`, cost: 100, reason: `Old ${i}`,
    }));
    mockScanAll.mockResolvedValueOnce([
      { playerId: 'p1', baseCost: 100, currentCost: 100, costHistory: longHistory },
    ]);
    mockPut.mockResolvedValue({});

    await recalculateCosts();

    const history = mockPut.mock.calls[0][0].Item.costHistory;
    expect(history).toHaveLength(20);
    // Oldest entry shifted off, new entry at end
    expect(history[0].reason).toBe('Old 1');
    expect(history[19].reason).toContain('Recalculated');
  });

  it('uses default baseCost 100 when player has no existing cost', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { costFluctuationEnabled: true, costChangePerWin: 10, costChangePerLoss: 5 },
    });
    mockScanAll.mockResolvedValueOnce([{ playerId: 'p1' }]);
    mockScanAll.mockResolvedValueOnce([]);
    mockScanAll.mockResolvedValueOnce([]); // no existing costs
    mockPut.mockResolvedValue({});

    await recalculateCosts();

    expect(mockPut.mock.calls[0][0].Item.baseCost).toBe(100);
    expect(mockPut.mock.calls[0][0].Item.currentCost).toBe(100);
  });

  it('uses config defaults when config is empty', async () => {
    mockGet.mockResolvedValueOnce({ Item: undefined });
    // Defaults: costFluctuationEnabled: true, costChangePerWin: 10, costChangePerLoss: 5
    mockScanAll.mockResolvedValueOnce([{ playerId: 'p1' }]);
    mockScanAll.mockResolvedValueOnce([
      { matchId: 'm1', status: 'completed', date: recentDate, winners: ['p1'], losers: [] },
    ]);
    mockScanAll.mockResolvedValueOnce([]);
    mockPut.mockResolvedValue({});

    await recalculateCosts();

    // baseCost 100 + 1 win * 10 = 110
    expect(mockPut.mock.calls[0][0].Item.currentCost).toBe(110);
  });
});

// ---- handler (API endpoint) ------------------------------------------------

describe('recalculateWrestlerCosts handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when user lacks Admin role', async () => {
    const event = withAuth(makeEvent(), 'Fantasy');
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('returns 200 on success', async () => {
    // Setup minimal recalculateCosts to succeed
    mockGet.mockResolvedValueOnce({ Item: { costFluctuationEnabled: false } });

    const event = withAuth(makeEvent());
    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).message).toBe('Wrestler costs recalculated');
  });

  it('returns 500 on unexpected error', async () => {
    mockGet.mockRejectedValueOnce(new Error('fail'));

    const event = withAuth(makeEvent());
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(500);
  });
});
