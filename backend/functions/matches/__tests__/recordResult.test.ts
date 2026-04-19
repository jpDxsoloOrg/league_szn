import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Repository Mocks -----------------------------------------------------

const mockMatchesRepo = {
  findById: vi.fn(),
  findByIdWithDate: vi.fn(),
  list: vi.fn(),
  listCompleted: vi.fn(),
  listByStatus: vi.fn(),
  listByTournament: vi.fn(),
  listBySeason: vi.fn(),
  delete: vi.fn(),
};

const mockChampionshipsRepo = {
  findById: vi.fn(),
  list: vi.fn(),
  listActive: vi.fn(),
  listHistory: vi.fn(),
  listAllHistory: vi.fn(),
  findCurrentReign: vi.fn(),
  update: vi.fn(),
  removeChampion: vi.fn(),
  closeReign: vi.fn(),
  reopenReign: vi.fn(),
  deleteHistoryEntry: vi.fn(),
  incrementDefenses: vi.fn(),
  decrementDefenses: vi.fn(),
};

const mockTournamentsRepo = {
  findById: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
};

const mockEventsRepo = {
  findById: vi.fn(),
  list: vi.fn(),
  listByStatus: vi.fn(),
  listBySeason: vi.fn(),
  listByEventType: vi.fn(),
  listByDateRange: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getCheckIn: vi.fn(),
  listCheckIns: vi.fn(),
  upsertCheckIn: vi.fn(),
  deleteCheckIn: vi.fn(),
};

const mockContendersRepo = {
  listByChampionship: vi.fn(),
  listByChampionshipRanked: vi.fn(),
  deleteAllForChampionship: vi.fn(),
  upsertRanking: vi.fn(),
  findOverride: vi.fn(),
  listActiveOverrides: vi.fn(),
  createOverride: vi.fn(),
  deactivateOverride: vi.fn(),
  writeHistory: vi.fn(),
};

const mockRunInTransaction = vi.fn();

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    competition: {
      matches: mockMatchesRepo,
      championships: mockChampionshipsRepo,
      tournaments: mockTournamentsRepo,
      contenders: mockContendersRepo,
    },
    leagueOps: {
      events: mockEventsRepo,
    },
    runInTransaction: mockRunInTransaction,
  }),
}));

vi.mock('../../../lib/asyncLambda', () => ({
  invokeAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../updateGroupStats', () => ({
  updateGroupStats: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../fantasy/calculateFantasyPoints', () => ({
  calculateFantasyPoints: vi.fn().mockResolvedValue(undefined),
}));

import { handler as recordResult } from '../recordResult';

// ---- Helpers ---------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};
const pending: Record<string, unknown> = {
  matchId: 'm1',
  date: '2024-06-01',
  status: 'pending',
  participants: ['p1', 'p2'],
};

function ev(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'POST',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '', requestContext: { authorizer: {} } as never,
    ...overrides,
  };
}

function stubSuccess(match = pending) {
  mockMatchesRepo.findByIdWithDate.mockResolvedValue(match);
  mockRunInTransaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
    const tx = {
      updateMatch: vi.fn(),
      incrementPlayerRecord: vi.fn(),
      incrementStanding: vi.fn(),
      updateChampionship: vi.fn(),
      closeReign: vi.fn(),
      startReign: vi.fn(),
    };
    await fn(tx);
    return tx;
  });
  mockEventsRepo.list.mockResolvedValue([]);
}

// ---- Validation ------------------------------------------------------------

describe('recordResult — validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when matchId is missing', async () => {
    const r = await recordResult(ev({ pathParameters: null, body: '{}' }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toBe('Match ID is required');
  });

  it('returns 400 when body is null', async () => {
    const r = await recordResult(ev({ pathParameters: { matchId: 'm1' }, body: null }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toBe('Request body is required');
  });

  it('returns 400 for invalid JSON', async () => {
    const r = await recordResult(ev({ pathParameters: { matchId: 'm1' }, body: '{bad' }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 400 when winners are empty', async () => {
    const r = await recordResult(ev({
      pathParameters: { matchId: 'm1' },
      body: JSON.stringify({ winners: [], losers: ['p2'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toBe('Winners and losers are required');
  });

  it('returns 400 when a player is both winner and loser', async () => {
    const r = await recordResult(ev({
      pathParameters: { matchId: 'm1' },
      body: JSON.stringify({ winners: ['p1'], losers: ['p1'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('cannot be both a winner and loser');
  });

  it('returns 404 when match is not found', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(null);
    const r = await recordResult(ev({
      pathParameters: { matchId: 'x' },
      body: JSON.stringify({ winners: ['p1'], losers: ['p2'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(404);
  });

  it('returns 400 when match is already completed', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue({ ...pending, status: 'completed' });
    const r = await recordResult(ev({
      pathParameters: { matchId: 'm1' },
      body: JSON.stringify({ winners: ['p1'], losers: ['p2'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toBe('Match has already been completed');
  });
});

// ---- Core Transaction ------------------------------------------------------

describe('recordResult — core transaction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records result and returns 200 with completed match', async () => {
    stubSuccess();
    const r = await recordResult(ev({
      pathParameters: { matchId: 'm1' },
      body: JSON.stringify({ winners: ['p1'], losers: ['p2'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    const b = JSON.parse(r!.body);
    expect(b.match.status).toBe('completed');
    expect(b.match.winners).toEqual(['p1']);
  });

  it('calls transaction with match update + winner wins + loser losses', async () => {
    stubSuccess();
    await recordResult(ev({
      pathParameters: { matchId: 'm1' },
      body: JSON.stringify({ winners: ['p1'], losers: ['p2'] }),
    }), ctx, cb);

    expect(mockRunInTransaction).toHaveBeenCalled();
    // Execute the callback to inspect tx calls
    const txFn = mockRunInTransaction.mock.calls[0][0];
    const tx = {
      updateMatch: vi.fn(),
      incrementPlayerRecord: vi.fn(),
      incrementStanding: vi.fn(),
      updateChampionship: vi.fn(),
      closeReign: vi.fn(),
      startReign: vi.fn(),
    };
    await txFn(tx);

    // Match update
    expect(tx.updateMatch).toHaveBeenCalledWith('m1', '2024-06-01', expect.objectContaining({
      status: 'completed',
      winners: ['p1'],
      losers: ['p2'],
    }));
    // Winner gets +1 win
    expect(tx.incrementPlayerRecord).toHaveBeenCalledWith('p1', { wins: 1 });
    // Loser gets +1 loss
    expect(tx.incrementPlayerRecord).toHaveBeenCalledWith('p2', { losses: 1 });
  });

  it('includes season standings updates when match has seasonId', async () => {
    stubSuccess({ ...pending, seasonId: 's1' });
    await recordResult(ev({
      pathParameters: { matchId: 'm1' },
      body: JSON.stringify({ winners: ['p1'], losers: ['p2'] }),
    }), ctx, cb);

    // Re-execute the callback to inspect tx calls
    const txFn = mockRunInTransaction.mock.calls[0][0];
    const tx = {
      updateMatch: vi.fn(),
      incrementPlayerRecord: vi.fn(),
      incrementStanding: vi.fn(),
      updateChampionship: vi.fn(),
      closeReign: vi.fn(),
      startReign: vi.fn(),
    };
    await txFn(tx);

    // Season standings: winner wins + loser losses
    expect(tx.incrementStanding).toHaveBeenCalledWith('s1', 'p1', { wins: 1 });
    expect(tx.incrementStanding).toHaveBeenCalledWith('s1', 'p2', { losses: 1 });
    expect(tx.incrementStanding).toHaveBeenCalledTimes(2);
  });

  // Note: Draw detection (isDraw) requires winners === losers (sorted),
  // but the overlap validation on line 208 returns 400 before reaching draw logic.
  // Draw code paths are unreachable with the current validation.
});

// ---- Concurrency -----------------------------------------------------------

describe('recordResult — concurrency', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 with retry message on TransactionCanceledException', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(pending);
    const err = new Error('cancelled');
    (err as { name?: string }).name = 'TransactionCanceledException';
    mockRunInTransaction.mockRejectedValue(err);
    mockEventsRepo.list.mockResolvedValue([]);
    const r = await recordResult(ev({
      pathParameters: { matchId: 'm1' },
      body: JSON.stringify({ winners: ['p1'], losers: ['p2'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('concurrent update');
  });

  it('returns 500 on non-transaction errors', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(pending);
    mockRunInTransaction.mockRejectedValue(new Error('Unknown'));
    const r = await recordResult(ev({
      pathParameters: { matchId: 'm1' },
      body: JSON.stringify({ winners: ['p1'], losers: ['p2'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(500);
  });
});

// ---- Background Ops --------------------------------------------------------

describe('recordResult — background ops', () => {
  beforeEach(() => vi.clearAllMocks());

  it('succeeds even if invokeAsync for contenders throws', async () => {
    const { invokeAsync } = await import('../../../lib/asyncLambda');
    vi.mocked(invokeAsync).mockRejectedValue(new Error('fail'));
    stubSuccess();
    const r = await recordResult(ev({
      pathParameters: { matchId: 'm1' },
      body: JSON.stringify({ winners: ['p1'], losers: ['p2'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
  });

  it('succeeds even if updateGroupStats throws', async () => {
    const { updateGroupStats } = await import('../updateGroupStats');
    vi.mocked(updateGroupStats).mockRejectedValue(new Error('fail'));
    stubSuccess();
    const r = await recordResult(ev({
      pathParameters: { matchId: 'm1' },
      body: JSON.stringify({ winners: ['p1'], losers: ['p2'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
  });
});
