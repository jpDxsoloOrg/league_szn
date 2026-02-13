import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockGet, mockPut, mockScan, mockQuery, mockUpdate, mockDelete, mockScanAll, mockQueryAll } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockScan: vi.fn(),
  mockQuery: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockScanAll: vi.fn(),
  mockQueryAll: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet,
    put: mockPut,
    scan: mockScan,
    query: mockQuery,
    update: mockUpdate,
    delete: mockDelete,
    scanAll: mockScanAll,
    queryAll: mockQueryAll,
  },
  TableNames: {
    PLAYERS: 'Players',
    SEASON_STANDINGS: 'SeasonStandings',
  },
}));

import { handler as getStandings } from '../getStandings';

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
    requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

// ─── All-time standings (no seasonId) ────────────────────────────────

describe('getStandings — all-time (no seasonId)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all players sorted by wins descending', async () => {
    mockScanAll.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', wins: 10, losses: 2, draws: 1 },
      { playerId: 'p2', name: 'Bob', wins: 15, losses: 5, draws: 0 },
      { playerId: 'p3', name: 'Carol', wins: 8, losses: 3, draws: 2 },
    ]);

    const result = await getStandings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.sortedByWins).toBe(true);
    expect(body.players).toHaveLength(3);
    // Sorted: Bob (15), Alice (10), Carol (8)
    expect(body.players[0].name).toBe('Bob');
    expect(body.players[1].name).toBe('Alice');
    expect(body.players[2].name).toBe('Carol');
  });

  it('breaks ties by losses ascending (fewer losses ranks higher)', async () => {
    mockScanAll.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', wins: 10, losses: 5, draws: 0 },
      { playerId: 'p2', name: 'Bob', wins: 10, losses: 2, draws: 0 },
      { playerId: 'p3', name: 'Carol', wins: 10, losses: 8, draws: 0 },
    ]);

    const result = await getStandings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    // Same wins (10), sorted by losses ascending: Bob(2), Alice(5), Carol(8)
    expect(body.players[0].name).toBe('Bob');
    expect(body.players[1].name).toBe('Alice');
    expect(body.players[2].name).toBe('Carol');
  });

  it('defaults missing wins/losses to 0 for sorting', async () => {
    mockScanAll.mockResolvedValue([
      { playerId: 'p1', name: 'NoStats' },
      { playerId: 'p2', name: 'HasWins', wins: 3, losses: 1 },
    ]);

    const result = await getStandings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    // HasWins (3) > NoStats (0)
    expect(body.players[0].name).toBe('HasWins');
    expect(body.players[1].name).toBe('NoStats');
  });

  it('returns empty array when no players exist', async () => {
    mockScanAll.mockResolvedValue([]);

    const result = await getStandings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.players).toEqual([]);
    expect(body.sortedByWins).toBe(true);
  });

  it('does not include seasonId in response for all-time standings', async () => {
    mockScanAll.mockResolvedValue([]);

    const result = await getStandings(makeEvent(), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.seasonId).toBeUndefined();
  });

  it('calls scanAll on Players table', async () => {
    mockScanAll.mockResolvedValue([]);

    await getStandings(makeEvent(), ctx, cb);

    expect(mockScanAll).toHaveBeenCalledOnce();
    expect(mockScanAll).toHaveBeenCalledWith({
      TableName: 'Players',
    });
  });
});

// ─── Error handling (all-time path) ──────────────────────────────────

describe('getStandings — error handling (all-time)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 500 when scanAll throws', async () => {
    mockScanAll.mockRejectedValue(new Error('DynamoDB connection failed'));

    const result = await getStandings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch standings');
  });
});
