import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockOverallsListAll, mockMatchesListCompleted, mockPlayersList, mockSeasonStandingsListBySeason, mockListAllHistory } = vi.hoisted(() => ({
  mockOverallsListAll: vi.fn(),
  mockMatchesListCompleted: vi.fn(),
  mockPlayersList: vi.fn(),
  mockSeasonStandingsListBySeason: vi.fn(),
  mockListAllHistory: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    roster: {
      overalls: { listAll: mockOverallsListAll },
      players: { list: mockPlayersList },
    },
    competition: {
      matches: { listCompleted: mockMatchesListCompleted },
      championships: { listAllHistory: mockListAllHistory },
    },
    season: {
      standings: { listBySeason: mockSeasonStandingsListBySeason },
    },
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

function win(matchId: string, winner: string, loser: string, date: string) {
  return { matchId, date, updatedAt: date, participants: [winner, loser], winners: [winner], losers: [loser], status: 'completed' };
}

// ─── All-time standings (no seasonId) ────────────────────────────────

describe('getStandings — all-time (no seasonId)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAllHistory.mockResolvedValue([]);
  });

  it('excludes players whose Cognito user lost the Wrestler role', async () => {
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'W1', wins: 10, hasWrestlerRole: true },
      { playerId: 'p2', name: 'Demoted', currentWrestler: 'W2', wins: 15, hasWrestlerRole: false },
      // Never synced: stays visible so shipping the filter cannot blank the
      // standings before the backfill runs.
      { playerId: 'p3', name: 'Unsynced', currentWrestler: 'W3', wins: 8 },
    ]);

    const result = await getStandings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Alice', 'Unsynced']);
  });

  it('ranks players by league points, not by stored wins', async () => {
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([
      win('m1', 'p3', 'p1', '2026-01-01T00:00:00.000Z'),
      win('m2', 'p3', 'p2', '2026-01-02T00:00:00.000Z'),
      win('m3', 'p1', 'p2', '2026-01-03T00:00:00.000Z'),
    ]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'W1', wins: 10, losses: 2, draws: 1 },
      { playerId: 'p2', name: 'Bob', currentWrestler: 'W2', wins: 15, losses: 5, draws: 0 },
      { playerId: 'p3', name: 'Carol', currentWrestler: 'W3', wins: 8, losses: 3, draws: 2 },
    ]);

    const result = await getStandings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.rankedBy).toBe('points');
    expect(body.sortedByWins).toBe(false);
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Carol', 'Alice', 'Bob']);
    expect(body.players.map((p: { rank: number }) => p.rank)).toEqual([1, 2, 3]);
    expect(body.players[0]).toMatchObject({ points: 6, qualityWins: 0, streakBonuses: 0 });
    // W-L-D still comes from the stored totals.
    expect(body.players[2]).toMatchObject({ name: 'Bob', wins: 15, losses: 5, draws: 0, points: 0 });
  });

  it('puts players with no matches last even when they have stored wins', async () => {
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([win('m1', 'p3', 'p2', '2026-01-01T00:00:00.000Z')]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Aaron', currentWrestler: 'W1', wins: 3, losses: 1 },
      { playerId: 'p2', name: 'Loser', currentWrestler: 'W2', wins: 0, losses: 1 },
    ]);

    const result = await getStandings(makeEvent(), ctx, cb);

    const body = JSON.parse(result!.body);
    // Loser has 0 points but has played; Aaron has played nothing.
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Loser', 'Aaron']);
    expect(body.players[1]).toMatchObject({ wins: 3, points: 0, rank: 2 });
  });

  it('counts a hidden opponent for quality wins and SOS without returning them', async () => {
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([
      win('m1', 'hidden', 'nobody', '2026-01-01T00:00:00.000Z'),
      win('m2', 'hidden', 'nobody', '2026-01-02T00:00:00.000Z'),
      win('m3', 'p1', 'hidden', '2026-01-03T00:00:00.000Z'),
      win('m4', 'p2', 'nobody', '2026-01-04T00:00:00.000Z'),
    ]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Zed', currentWrestler: 'W1', wins: 1, losses: 0 },
      { playerId: 'p2', name: 'Amy', currentWrestler: 'W2', wins: 1, losses: 0 },
      { playerId: 'hidden', name: 'Hidden', currentWrestler: 'W3', hasWrestlerRole: false, wins: 2, losses: 1 },
      { playerId: 'nobody', name: 'Nobody', currentWrestler: '', wins: 0, losses: 3 },
    ]);

    const result = await getStandings(makeEvent(), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Zed', 'Amy']);
    // Zed beat the hidden player while they sat on 6 points: a quality win,
    // and SOS is the hidden player's 6 points over 3 matches.
    expect(body.players[0]).toMatchObject({ points: 4, qualityWins: 1, sos: 2, rank: 1 });
    expect(body.players[1]).toMatchObject({ points: 3, qualityWins: 0, sos: 0, rank: 2 });
  });

  it('gives title holders a quality win from the reign index', async () => {
    mockListAllHistory.mockResolvedValue([
      { championshipId: 'c1', champion: 'p2', wonDate: '2025-12-01T00:00:00.000Z', matchId: 'm0' },
    ]);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([win('m1', 'p1', 'p2', '2026-01-01T00:00:00.000Z')]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'W1', wins: 1, losses: 0 },
      { playerId: 'p2', name: 'Champ', currentWrestler: 'W2', wins: 0, losses: 1 },
    ]);

    const result = await getStandings(makeEvent(), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.players[0]).toMatchObject({ name: 'Alice', points: 4, qualityWins: 1 });
  });

  it('warns, but still answers, when stored records drift from the matches', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([win('m1', 'p1', 'p2', '2026-01-01T00:00:00.000Z')]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'W1', wins: 7, losses: 0 },
      { playerId: 'p2', name: 'Bob', currentWrestler: 'W2', wins: 0, losses: 1 },
    ]);

    const result = await getStandings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).players[0]).toMatchObject({ name: 'Alice', wins: 7, points: 3 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toEqual(['p1']);
    warn.mockRestore();
  });

  it('defaults missing wins/losses to 0', async () => {
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([{ playerId: 'p1', name: 'NoStats', currentWrestler: 'W1' }]);

    const result = await getStandings(makeEvent(), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.players[0]).toMatchObject({ wins: 0, losses: 0, draws: 0, points: 0, rank: 1 });
  });

  it('returns empty array when no players exist', async () => {
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([]);

    const result = await getStandings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.players).toEqual([]);
    expect(body.rankedBy).toBe('points');
    expect(body.sortedByWins).toBe(false);
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

  it('includes recentForm and currentStreak on each player (ordered by match date desc)', async () => {
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
    expect(alice.recentForm).toEqual(['W', 'W', 'L']); // newest first by date: 05 W, 04 W, 03 L
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
