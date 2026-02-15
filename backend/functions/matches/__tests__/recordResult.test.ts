import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Mocks ----------------------------------------------------------------

const { mockGet, mockPut, mockScan, mockQuery, mockUpdate, mockDelete, mockTransactWrite } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockScan: vi.fn(),
  mockQuery: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockTransactWrite: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet, put: mockPut, scan: mockScan, query: mockQuery,
    update: mockUpdate, delete: mockDelete, scanAll: vi.fn(), queryAll: vi.fn(),
    transactWrite: mockTransactWrite,
  },
  TableNames: {
    MATCHES: 'Matches', PLAYERS: 'Players', CHAMPIONSHIPS: 'Championships',
    CHAMPIONSHIP_HISTORY: 'ChampionshipHistory', TOURNAMENTS: 'Tournaments',
    SEASONS: 'Seasons', SEASON_STANDINGS: 'SeasonStandings',
    EVENTS: 'Events', CONTENDER_RANKINGS: 'ContenderRankings',
  },
}));

vi.mock('../../../lib/rankingCalculator', () => ({
  calculateRankingsForChampionship: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../fantasy/recalculateWrestlerCosts', () => ({
  recalculateCosts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../fantasy/calculateFantasyPoints', () => ({
  calculateFantasyPoints: vi.fn().mockResolvedValue(undefined),
}));

import { handler as recordResult } from '../recordResult';

// ---- Helpers ---------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};
const pending: { matchId: string; date: string; status: string; participants: string[]; seasonId?: string } = {
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
    stageVariables: null, resource: '', requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

function stubSuccess(match = pending) {
  mockQuery.mockResolvedValue({ Items: [match] });
  mockTransactWrite.mockResolvedValue({});
  mockScan.mockResolvedValue({ Items: [] });
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
    mockQuery.mockResolvedValue({ Items: [] });
    const r = await recordResult(ev({
      pathParameters: { matchId: 'x' },
      body: JSON.stringify({ winners: ['p1'], losers: ['p2'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(404);
  });

  it('returns 400 when match is already completed', async () => {
    mockQuery.mockResolvedValue({ Items: [{ ...pending, status: 'completed' }] });
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

  it('builds transaction: match update + winner wins + loser losses', async () => {
    stubSuccess();
    await recordResult(ev({
      pathParameters: { matchId: 'm1' },
      body: JSON.stringify({ winners: ['p1'], losers: ['p2'] }),
    }), ctx, cb);
    const items = mockTransactWrite.mock.calls[0][0].TransactItems;
    expect(items).toHaveLength(3);
    expect(items[0].Update.ConditionExpression).toContain(':pending');
    expect(items[0].Update.UpdateExpression).toContain('version');
  });

  it('includes season standings updates when match has seasonId', async () => {
    stubSuccess({ ...pending, seasonId: 's1' });
    await recordResult(ev({
      pathParameters: { matchId: 'm1' },
      body: JSON.stringify({ winners: ['p1'], losers: ['p2'] }),
    }), ctx, cb);
    const items = mockTransactWrite.mock.calls[0][0].TransactItems;
    expect(items).toHaveLength(5); // match + 2 players + 2 season standings
    const seasonItems = items.filter((i: any) => i.Update?.TableName === 'SeasonStandings');
    expect(seasonItems).toHaveLength(2);
  });

  // Note: Draw detection (isDraw) requires winners === losers (sorted),
  // but the overlap validation on line 208 returns 400 before reaching draw logic.
  // Draw code paths are unreachable with the current validation.
});

// ---- Concurrency -----------------------------------------------------------

describe('recordResult — concurrency', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 with retry message on TransactionCanceledException', async () => {
    mockQuery.mockResolvedValue({ Items: [pending] });
    const err = new Error('cancelled');
    (err as any).name = 'TransactionCanceledException';
    mockTransactWrite.mockRejectedValue(err);
    const r = await recordResult(ev({
      pathParameters: { matchId: 'm1' },
      body: JSON.stringify({ winners: ['p1'], losers: ['p2'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('concurrent update');
  });

  it('returns 500 on non-transaction errors', async () => {
    mockQuery.mockResolvedValue({ Items: [pending] });
    mockTransactWrite.mockRejectedValue(new Error('Unknown'));
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

  it('succeeds even if ranking recalculation throws', async () => {
    const { calculateRankingsForChampionship } = await import('../../../lib/rankingCalculator');
    vi.mocked(calculateRankingsForChampionship).mockRejectedValue(new Error('fail'));
    stubSuccess();
    const r = await recordResult(ev({
      pathParameters: { matchId: 'm1' },
      body: JSON.stringify({ winners: ['p1'], losers: ['p2'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
  });

  it('succeeds even if cost recalculation throws', async () => {
    const { recalculateCosts } = await import('../../fantasy/recalculateWrestlerCosts');
    vi.mocked(recalculateCosts).mockRejectedValue(new Error('fail'));
    stubSuccess();
    const r = await recordResult(ev({
      pathParameters: { matchId: 'm1' },
      body: JSON.stringify({ winners: ['p1'], losers: ['p2'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
  });
});
