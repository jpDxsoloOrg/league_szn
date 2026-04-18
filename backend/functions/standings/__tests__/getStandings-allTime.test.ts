import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockOverallsListAll, mockMatchesListCompleted, mockPlayersList, mockSeasonStandingsListBySeason } = vi.hoisted(() => ({
  mockOverallsListAll: vi.fn(),
  mockMatchesListCompleted: vi.fn(),
  mockPlayersList: vi.fn(),
  mockSeasonStandingsListBySeason: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    overalls: { listAll: mockOverallsListAll },
    matches: { listCompleted: mockMatchesListCompleted },
    players: { list: mockPlayersList },
    seasonStandings: { listBySeason: mockSeasonStandingsListBySeason },
  }),
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
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

// ─── All-time standings (no seasonId) ────────────────────────────────

describe('getStandings — all-time (no seasonId)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all players sorted by wins descending', async () => {
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'W1', wins: 10, losses: 2, draws: 1 },
      { playerId: 'p2', name: 'Bob', currentWrestler: 'W2', wins: 15, losses: 5, draws: 0 },
      { playerId: 'p3', name: 'Carol', currentWrestler: 'W3', wins: 8, losses: 3, draws: 2 },
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
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'W1', wins: 10, losses: 5, draws: 0 },
      { playerId: 'p2', name: 'Bob', currentWrestler: 'W2', wins: 10, losses: 2, draws: 0 },
      { playerId: 'p3', name: 'Carol', currentWrestler: 'W3', wins: 10, losses: 8, draws: 0 },
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
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'NoStats', currentWrestler: 'W1' },
      { playerId: 'p2', name: 'HasWins', currentWrestler: 'W2', wins: 3, losses: 1 },
    ]);

    const result = await getStandings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    // HasWins (3) > NoStats (0)
    expect(body.players[0].name).toBe('HasWins');
    expect(body.players[1].name).toBe('NoStats');
  });

  it('returns empty array when no players exist', async () => {
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([]);

    const result = await getStandings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.players).toEqual([]);
    expect(body.sortedByWins).toBe(true);
  });

  it('does not include seasonId in response for all-time standings', async () => {
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([]);

    const result = await getStandings(makeEvent(), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.seasonId).toBeUndefined();
  });

  it('calls repository methods for overalls, matches, and players', async () => {
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([]);

    await getStandings(makeEvent(), ctx, cb);

    expect(mockOverallsListAll).toHaveBeenCalledTimes(1);
    expect(mockMatchesListCompleted).toHaveBeenCalledTimes(1);
    expect(mockPlayersList).toHaveBeenCalledTimes(1);
  });

  it('includes recentForm and currentStreak on each player (ordered by updatedAt desc)', async () => {
    const completedMatches = [
      { date: '2024-01-05', updatedAt: '2024-01-05T12:00:00Z', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], status: 'completed' },
      { date: '2024-01-04', updatedAt: '2024-01-04T12:00:00Z', participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'], status: 'completed' },
      { date: '2024-01-03', updatedAt: '2024-01-03T12:00:00Z', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'], status: 'completed' },
    ];
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue(completedMatches);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'W1', wins: 10, losses: 2, draws: 1 },
      { playerId: 'p2', name: 'Bob', currentWrestler: 'W2', wins: 8, losses: 5, draws: 0 },
    ]);

    const result = await getStandings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const alice = body.players.find((p: { playerId: string }) => p.playerId === 'p1');
    expect(alice.recentForm).toEqual(['W', 'W', 'L']); // newest first by updatedAt: 05 W, 04 W, 03 L
    expect(alice.currentStreak).toEqual({ type: 'W', count: 2 });
    const bob = body.players.find((p: { playerId: string }) => p.playerId === 'p2');
    expect(bob.recentForm).toEqual(['L', 'W']); // 05 L (vs p1), 03 W (vs p1)
    expect(bob.currentStreak).toEqual({ type: 'L', count: 1 });
  });

  it('excludes completed matches without updatedAt from recentForm and streak', async () => {
    const completedMatches = [
      { date: '2024-01-06', updatedAt: '2024-01-06T12:00:00Z', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], status: 'completed' },
      { date: '2024-01-05', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'], status: 'completed' }, // no updatedAt
    ];
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue(completedMatches);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'W1', wins: 1, losses: 1, draws: 0 },
      { playerId: 'p2', name: 'Bob', currentWrestler: 'W2', wins: 1, losses: 1, draws: 0 },
    ]);

    const result = await getStandings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const alice = body.players.find((p: { playerId: string }) => p.playerId === 'p1');
    // Only the match with updatedAt (p1 won on 01-06) counts
    expect(alice.recentForm).toEqual(['W']);
    expect(alice.currentStreak).toEqual({ type: 'W', count: 1 });
  });

  it('returns empty recentForm and zero streak when no completed matches', async () => {
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([{ playerId: 'p1', name: 'Alice', currentWrestler: 'W1', wins: 0, losses: 0, draws: 0 }]);

    const result = await getStandings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.players[0].recentForm).toEqual([]);
    expect(body.players[0].currentStreak).toEqual({ type: 'W', count: 0 });
  });
});

// ─── Error handling (all-time path) ──────────────────────────────────

describe('getStandings — error handling (all-time)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 500 when a repository method throws', async () => {
    mockOverallsListAll.mockRejectedValue(new Error('DynamoDB connection failed'));
    mockMatchesListCompleted.mockRejectedValue(new Error('DynamoDB connection failed'));

    const result = await getStandings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch standings');
  });
});
