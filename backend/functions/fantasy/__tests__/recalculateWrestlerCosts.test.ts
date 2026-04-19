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

const mockMatchesRepo = {
  findById: vi.fn(),
  list: vi.fn(),
};

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    user: {
      fantasy: mockFantasyRepo,
    },
    roster: {
      players: mockPlayersRepo,
    },
    competition: {
      matches: mockMatchesRepo,
    },
  }),
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
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ costFluctuationEnabled: false });

    await recalculateCosts();

    expect(mockPlayersRepo.list).not.toHaveBeenCalled();
    expect(mockFantasyRepo.upsertCost).not.toHaveBeenCalled();
  });

  it('calculates newCost = baseCost + (wins * costPerWin) - (losses * costPerLoss)', async () => {
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ costFluctuationEnabled: true, costChangePerWin: 10, costChangePerLoss: 5 });
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1' }]);
    mockMatchesRepo.list.mockResolvedValueOnce([
      { matchId: 'm1', status: 'completed', date: recentDate, winners: ['p1'], losers: ['p2'] },
      { matchId: 'm2', status: 'completed', date: recentDate, winners: ['p2'], losers: ['p1'] },
    ]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([
      { playerId: 'p1', baseCost: 100, currentCost: 100, costHistory: [] },
    ]);
    mockFantasyRepo.upsertCost.mockResolvedValue({});

    await recalculateCosts();

    expect(mockFantasyRepo.upsertCost).toHaveBeenCalledOnce();
    const call = mockFantasyRepo.upsertCost.mock.calls[0][0];
    // 100 + (1 * 10) - (1 * 5) = 105
    expect(call.currentCost).toBe(105);
    expect(call.winRate30Days).toBe(50);
    expect(call.recentRecord).toBe('1-1');
  });

  it('clamps cost at 50% of baseCost (lower bound)', async () => {
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ costFluctuationEnabled: true, costChangePerWin: 5, costChangePerLoss: 100 });
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1' }]);
    mockMatchesRepo.list.mockResolvedValueOnce([
      { matchId: 'm1', status: 'completed', date: recentDate, winners: ['p2'], losers: ['p1'] },
      { matchId: 'm2', status: 'completed', date: recentDate, winners: ['p2'], losers: ['p1'] },
      { matchId: 'm3', status: 'completed', date: recentDate, winners: ['p2'], losers: ['p1'] },
      { matchId: 'm4', status: 'completed', date: recentDate, winners: ['p2'], losers: ['p1'] },
      { matchId: 'm5', status: 'completed', date: recentDate, winners: ['p2'], losers: ['p1'] },
    ]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([
      { playerId: 'p1', baseCost: 100, currentCost: 100, costHistory: [] },
    ]);
    mockFantasyRepo.upsertCost.mockResolvedValue({});

    await recalculateCosts();

    // 100 + 0 - 500 = -400 => clamped to floor(100*0.5) = 50
    expect(mockFantasyRepo.upsertCost.mock.calls[0][0].currentCost).toBe(50);
  });

  it('clamps cost at 200% of baseCost (upper bound)', async () => {
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ costFluctuationEnabled: true, costChangePerWin: 100, costChangePerLoss: 0 });
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1' }]);
    const wins = Array.from({ length: 10 }, (_, i) => ({
      matchId: `m${i}`, status: 'completed', date: recentDate, winners: ['p1'], losers: ['p2'],
    }));
    mockMatchesRepo.list.mockResolvedValueOnce(wins);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([
      { playerId: 'p1', baseCost: 100, currentCost: 100, costHistory: [] },
    ]);
    mockFantasyRepo.upsertCost.mockResolvedValue({});

    await recalculateCosts();

    // 100 + 1000 - 0 = 1100 => clamped to floor(100*2) = 200
    expect(mockFantasyRepo.upsertCost.mock.calls[0][0].currentCost).toBe(200);
  });

  it('adds history entry when cost changes', async () => {
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ costFluctuationEnabled: true, costChangePerWin: 10, costChangePerLoss: 5 });
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1' }]);
    mockMatchesRepo.list.mockResolvedValueOnce([
      { matchId: 'm1', status: 'completed', date: recentDate, winners: ['p1'], losers: ['p2'] },
    ]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([
      { playerId: 'p1', baseCost: 100, currentCost: 100, costHistory: [] },
    ]);
    mockFantasyRepo.upsertCost.mockResolvedValue({});

    await recalculateCosts();

    const call = mockFantasyRepo.upsertCost.mock.calls[0][0];
    // Cost changed from 100 to 110 => history entry added
    expect(call.currentCost).toBe(110);
    expect(call.costHistory).toHaveLength(1);
    expect(call.costHistory[0].cost).toBe(110);
    expect(call.costHistory[0].reason).toContain('1W-0L');
  });

  it('does not add history entry when cost stays the same', async () => {
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ costFluctuationEnabled: true, costChangePerWin: 10, costChangePerLoss: 10 });
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1' }]);
    mockMatchesRepo.list.mockResolvedValueOnce([
      { matchId: 'm1', status: 'completed', date: recentDate, winners: ['p1'], losers: ['p2'] },
      { matchId: 'm2', status: 'completed', date: recentDate, winners: ['p2'], losers: ['p1'] },
    ]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([
      { playerId: 'p1', baseCost: 100, currentCost: 100, costHistory: [] },
    ]);
    mockFantasyRepo.upsertCost.mockResolvedValue({});

    await recalculateCosts();

    expect(mockFantasyRepo.upsertCost.mock.calls[0][0].costHistory).toHaveLength(0);
  });

  it('keeps only the last 20 cost history entries', async () => {
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ costFluctuationEnabled: true, costChangePerWin: 10, costChangePerLoss: 5 });
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1' }]);
    mockMatchesRepo.list.mockResolvedValueOnce([
      { matchId: 'm1', status: 'completed', date: recentDate, winners: ['p1'], losers: ['p2'] },
    ]);
    const longHistory = Array.from({ length: 20 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`, cost: 100, reason: `Old ${i}`,
    }));
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([
      { playerId: 'p1', baseCost: 100, currentCost: 100, costHistory: longHistory },
    ]);
    mockFantasyRepo.upsertCost.mockResolvedValue({});

    await recalculateCosts();

    const history = mockFantasyRepo.upsertCost.mock.calls[0][0].costHistory;
    expect(history).toHaveLength(20);
    // Oldest entry shifted off, new entry at end
    expect(history[0].reason).toBe('Old 1');
    expect(history[19].reason).toContain('Recalculated');
  });

  it('uses default baseCost 100 when player has no existing cost', async () => {
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ costFluctuationEnabled: true, costChangePerWin: 10, costChangePerLoss: 5 });
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1' }]);
    mockMatchesRepo.list.mockResolvedValueOnce([]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([]); // no existing costs
    mockFantasyRepo.upsertCost.mockResolvedValue({});

    await recalculateCosts();

    expect(mockFantasyRepo.upsertCost.mock.calls[0][0].baseCost).toBe(100);
    expect(mockFantasyRepo.upsertCost.mock.calls[0][0].currentCost).toBe(100);
  });

  it('uses config defaults when config is empty', async () => {
    mockFantasyRepo.getConfig.mockResolvedValueOnce(null);
    // Defaults: costFluctuationEnabled: true, costChangePerWin: 10, costChangePerLoss: 5
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1' }]);
    mockMatchesRepo.list.mockResolvedValueOnce([
      { matchId: 'm1', status: 'completed', date: recentDate, winners: ['p1'], losers: [] },
    ]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([]);
    mockFantasyRepo.upsertCost.mockResolvedValue({});

    await recalculateCosts();

    // baseCost 100 + 1 win * 10 = 110
    expect(mockFantasyRepo.upsertCost.mock.calls[0][0].currentCost).toBe(110);
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
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ costFluctuationEnabled: false });

    const event = withAuth(makeEvent());
    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).message).toBe('Wrestler costs recalculated');
  });

  it('returns 500 on unexpected error', async () => {
    mockFantasyRepo.getConfig.mockRejectedValueOnce(new Error('fail'));

    const event = withAuth(makeEvent());
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(500);
  });
});
