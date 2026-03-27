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
    MATCHES: 'Matches',
    STABLES: 'Stables',
    TAG_TEAMS: 'TagTeams',
    STABLE_INVITATIONS: 'StableInvitations',
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

function makeSeasonEvent(seasonId: string): APIGatewayProxyEvent {
  return makeEvent({
    queryStringParameters: { seasonId },
  });
}

// ─── Season-specific standings ───────────────────────────────────────

describe('getStandings — season-specific (with seasonId)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns season standings merged with all players', async () => {
    mockQueryAll.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 5, losses: 2, draws: 1 },
      { seasonId: 's1', playerId: 'p2', wins: 8, losses: 3, draws: 0 },
    ]);
    mockScanAll
      .mockResolvedValueOnce([]) // completed matches
      .mockResolvedValueOnce([
        { playerId: 'p1', name: 'Alice', currentWrestler: 'Wrestler A' },
        { playerId: 'p2', name: 'Bob', currentWrestler: 'Wrestler B' },
        { playerId: 'p3', name: 'Carol', currentWrestler: 'Wrestler C' },
      ]);

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.seasonId).toBe('s1');
    expect(body.sortedByWins).toBe(true);
    expect(body.players).toHaveLength(3);

    // Sorted: Bob (8 wins), Alice (5 wins), Carol (0 wins)
    expect(body.players[0].name).toBe('Bob');
    expect(body.players[0].wins).toBe(8);
    expect(body.players[0].losses).toBe(3);
    expect(body.players[0].draws).toBe(0);

    expect(body.players[1].name).toBe('Alice');
    expect(body.players[1].wins).toBe(5);

    // Carol has no season standings, so she gets 0-0-0
    expect(body.players[2].name).toBe('Carol');
    expect(body.players[2].wins).toBe(0);
    expect(body.players[2].losses).toBe(0);
    expect(body.players[2].draws).toBe(0);
    expect(body.players[0].recentForm).toEqual([]);
    expect(body.players[0].currentStreak).toEqual({ type: 'W', count: 0 });
  });

  it('gives 0-0-0 to players without season standings', async () => {
    mockQueryAll.mockResolvedValue([]); // no standings at all
    mockScanAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { playerId: 'p1', name: 'Alice', currentWrestler: 'W1' },
        { playerId: 'p2', name: 'Bob', currentWrestler: 'W2' },
      ]);

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.players).toHaveLength(2);
    body.players.forEach((p: unknown) => {
      const player = p as { wins: number; losses: number; draws: number };
      expect(player.wins).toBe(0);
      expect(player.losses).toBe(0);
      expect(player.draws).toBe(0);
    });
  });

  it('sorts season standings by wins desc then losses asc', async () => {
    mockQueryAll.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 5, losses: 4, draws: 0 },
      { seasonId: 's1', playerId: 'p2', wins: 5, losses: 1, draws: 0 },
      { seasonId: 's1', playerId: 'p3', wins: 7, losses: 3, draws: 0 },
    ]);
    mockScanAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { playerId: 'p1', name: 'Alice', currentWrestler: 'W1' },
        { playerId: 'p2', name: 'Bob', currentWrestler: 'W2' },
        { playerId: 'p3', name: 'Carol', currentWrestler: 'W3' },
      ]);

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    const body = JSON.parse(result!.body);
    // Carol (7w), Bob (5w/1l), Alice (5w/4l)
    expect(body.players[0].name).toBe('Carol');
    expect(body.players[1].name).toBe('Bob');
    expect(body.players[2].name).toBe('Alice');
  });

  it('returns empty players when no players exist for a season', async () => {
    mockQueryAll.mockResolvedValue([]);
    mockScanAll.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.players).toEqual([]);
    expect(body.seasonId).toBe('s1');
  });

  it('queries SeasonStandings table with correct seasonId', async () => {
    mockQueryAll.mockResolvedValue([]);
    mockScanAll.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await getStandings(makeSeasonEvent('season-42'), ctx, cb);

    expect(mockQueryAll).toHaveBeenCalledTimes(1);
    expect(mockQueryAll).toHaveBeenCalledWith({
      TableName: 'SeasonStandings',
      KeyConditionExpression: 'seasonId = :seasonId',
      ExpressionAttributeValues: { ':seasonId': 'season-42' },
    });
  });

  it('scans Matches then Players when fetching season standings', async () => {
    mockQueryAll.mockResolvedValue([]);
    mockScanAll.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await getStandings(makeSeasonEvent('s1'), ctx, cb);

    expect(mockScanAll).toHaveBeenCalledTimes(2);
    expect(mockScanAll).toHaveBeenNthCalledWith(1, expect.objectContaining({ TableName: 'Matches' }));
    expect(mockScanAll).toHaveBeenNthCalledWith(2, { TableName: 'Players' });
  });

  it('handles standings with falsy wins/losses/draws (defaults to 0)', async () => {
    mockQueryAll.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 0, losses: 0, draws: 0 },
      { seasonId: 's1', playerId: 'p2', wins: undefined, losses: undefined, draws: undefined },
    ]);
    mockScanAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { playerId: 'p1', name: 'Alice', currentWrestler: 'W1' },
        { playerId: 'p2', name: 'Bob', currentWrestler: 'W2' },
      ]);

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    body.players.forEach((p: unknown) => {
      const player = p as { wins: number; losses: number; draws: number };
      expect(player.wins).toBe(0);
      expect(player.losses).toBe(0);
      expect(player.draws).toBe(0);
    });
  });

  it('preserves original player fields in season standings response', async () => {
    mockQueryAll.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 3, losses: 1, draws: 0 },
    ]);
    mockScanAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { playerId: 'p1', name: 'Alice', currentWrestler: 'The Rock', divisionId: 'div-1' },
      ]);

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.players[0].name).toBe('Alice');
    expect(body.players[0].currentWrestler).toBe('The Rock');
    expect(body.players[0].divisionId).toBe('div-1');
    expect(body.players[0].wins).toBe(3);
  });
});

// ─── Error handling (season path) ────────────────────────────────────

describe('getStandings — error handling (season)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 500 when queryAll throws', async () => {
    mockQueryAll.mockRejectedValue(new Error('DynamoDB query failed'));

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch standings');
  });

  it('returns 500 when scanAll (players) throws during season query', async () => {
    mockQueryAll.mockResolvedValue([]);
    mockScanAll
      .mockResolvedValueOnce([]) // Matches scan succeeds
      .mockRejectedValueOnce(new Error('DynamoDB scan failed')); // Players scan fails

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch standings');
  });
});
