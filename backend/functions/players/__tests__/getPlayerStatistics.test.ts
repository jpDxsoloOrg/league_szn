import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockScanAll, mockGet } = vi.hoisted(() => ({
  mockScanAll: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet,
    put: vi.fn(),
    scan: vi.fn(),
    query: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    scanAll: mockScanAll,
    queryAll: vi.fn(),
  },
  TableNames: {
    PLAYERS: 'Players',
    MATCHES: 'Matches',
  },
}));

import { handler } from '../getPlayerStatistics';

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
    path: '/players/p1/statistics',
    pathParameters: { playerId: 'p1' },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

function makeMatch(overrides: Record<string, unknown> = {}) {
  return {
    matchId: `m-${Math.random().toString(36).slice(2, 8)}`,
    date: '2024-06-15',
    matchFormat: 'Singles',
    participants: ['p1', 'p2'],
    winners: ['p1'],
    losers: ['p2'],
    isChampionship: false,
    status: 'completed',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('getPlayerStatistics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when playerId is missing', async () => {
    const event = makeEvent({ pathParameters: null });
    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
  });

  it('returns 404 when player does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });

    const event = makeEvent();
    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Player not found');
  });

  it('returns overall and per-type stats for a player', async () => {
    mockGet.mockResolvedValue({
      Item: { playerId: 'p1', name: 'Player One', currentWrestler: 'Wrestler A' },
    });

    const matches = [
      makeMatch({ matchFormat: 'Singles', winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchFormat: 'Singles', winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchFormat: 'Tag Team', winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2', 'p3', 'p4'] }),
      makeMatch({ matchFormat: 'Ladder', winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchFormat: 'Cage', winners: ['p2'], losers: ['p1'] }),
    ];
    mockScanAll.mockResolvedValue(matches);

    const event = makeEvent();
    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);

    const body = JSON.parse(result!.body);
    expect(body.playerId).toBe('p1');
    expect(body.playerName).toBe('Player One');
    expect(body.wrestlerName).toBe('Wrestler A');

    // Overall: 3 wins, 2 losses
    expect(body.overall.wins).toBe(3);
    expect(body.overall.losses).toBe(2);
    expect(body.overall.matchesPlayed).toBe(5);
    expect(body.overall.winPercentage).toBe(60);

    // Singles: 1 win, 1 loss
    expect(body.byMatchType.singles.wins).toBe(1);
    expect(body.byMatchType.singles.losses).toBe(1);
    expect(body.byMatchType.singles.matchesPlayed).toBe(2);

    // Tag: 1 win
    expect(body.byMatchType.tag.wins).toBe(1);
    expect(body.byMatchType.tag.matchesPlayed).toBe(1);

    // Ladder: 1 win
    expect(body.byMatchType.ladder.wins).toBe(1);
    expect(body.byMatchType.ladder.matchesPlayed).toBe(1);

    // Cage: 1 loss
    expect(body.byMatchType.cage.losses).toBe(1);
    expect(body.byMatchType.cage.matchesPlayed).toBe(1);
  });

  it('filters by seasonId when provided', async () => {
    mockGet.mockResolvedValue({
      Item: { playerId: 'p1', name: 'Player One', currentWrestler: 'Wrestler A' },
    });

    const matches = [
      makeMatch({ seasonId: 's1', winners: ['p1'], losers: ['p2'] }),
      makeMatch({ seasonId: 's2', winners: ['p2'], losers: ['p1'] }),
      makeMatch({ seasonId: 's1', winners: ['p1'], losers: ['p2'] }),
    ];
    mockScanAll.mockResolvedValue(matches);

    const event = makeEvent({
      queryStringParameters: { seasonId: 's1' },
    });
    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);

    const body = JSON.parse(result!.body);
    expect(body.overall.wins).toBe(2);
    expect(body.overall.losses).toBe(0);
    expect(body.overall.matchesPlayed).toBe(2);
    expect(body.seasonId).toBe('s1');
  });

  it('returns empty stats when player has no matches', async () => {
    mockGet.mockResolvedValue({
      Item: { playerId: 'p1', name: 'Player One', currentWrestler: 'Wrestler A' },
    });
    mockScanAll.mockResolvedValue([]);

    const event = makeEvent();
    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);

    const body = JSON.parse(result!.body);
    expect(body.overall.wins).toBe(0);
    expect(body.overall.losses).toBe(0);
    expect(body.overall.matchesPlayed).toBe(0);
    expect(body.overall.winPercentage).toBe(0);
    expect(Object.keys(body.byMatchType)).toHaveLength(0);
  });

  it('returns 500 on DynamoDB error', async () => {
    mockGet.mockRejectedValue(new Error('DynamoDB error'));

    const event = makeEvent();
    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
  });
});
