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
    roster: {
      overalls: { listAll: mockOverallsListAll },
      players: { list: mockPlayersList },
    },
    competition: {
      matches: { listCompleted: mockMatchesListCompleted },
      championships: { listAllHistory: async () => [] },
    },
    season: { standings: { listBySeason: mockSeasonStandingsListBySeason } },
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

function makeSeasonEvent(seasonId: string): APIGatewayProxyEvent {
  return makeEvent({
    queryStringParameters: { seasonId },
  });
}

// ─── Season-specific standings ───────────────────────────────────────

describe('getStandings — season-specific (with seasonId)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects an over-long seasonId before it reaches the database', async () => {
    const result = await getStandings(makeSeasonEvent('x'.repeat(3000)), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(mockSeasonStandingsListBySeason).not.toHaveBeenCalled();
  });

  it('excludes players whose Cognito user lost the Wrestler role', async () => {
    mockSeasonStandingsListBySeason.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 5, losses: 2, draws: 1 },
      { seasonId: 's1', playerId: 'p2', wins: 8, losses: 3, draws: 0 },
    ]);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'Wrestler A', hasWrestlerRole: true },
      { playerId: 'p2', name: 'Demoted', currentWrestler: 'Wrestler B', hasWrestlerRole: false },
      { playerId: 'p3', name: 'Unsynced', currentWrestler: 'Wrestler C' },
    ]);

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Alice', 'Unsynced']);
  });

  it('computes form and streak from that season only', async () => {
    mockSeasonStandingsListBySeason.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 1, losses: 0, draws: 0 },
    ]);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([
      { matchId: 'm1', seasonId: 's1', winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'], date: '2026-02-01', updatedAt: '2026-02-01' },
      { matchId: 'm2', seasonId: 'other', winners: ['p2'], losers: ['p1'], participants: ['p1', 'p2'], date: '2026-03-01', updatedAt: '2026-03-01' },
      { matchId: 'm3', winners: ['p2'], losers: ['p1'], participants: ['p1', 'p2'], date: '2026-04-01', updatedAt: '2026-04-01' },
    ]);
    mockPlayersList.mockResolvedValue([{ playerId: 'p1', name: 'Alice', currentWrestler: 'Wrestler A' }]);

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    const [player] = JSON.parse(result!.body).players;
    expect(player.recentForm).toEqual(['W']);
    expect(player.currentStreak).toEqual({ type: 'W', count: 1 });
  });

  it('returns season standings merged with all players', async () => {
    mockSeasonStandingsListBySeason.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 5, losses: 2, draws: 1 },
      { seasonId: 's1', playerId: 'p2', wins: 8, losses: 3, draws: 0 },
    ]);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'Wrestler A' },
      { playerId: 'p2', name: 'Bob', currentWrestler: 'Wrestler B' },
      { playerId: 'p3', name: 'Carol', currentWrestler: 'Wrestler C' },
    ]);

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.seasonId).toBe('s1');
    expect(body.rankedBy).toBe('points');
    expect(body.sortedByWins).toBe(false);
    expect(body.players).toHaveLength(3);

    // No season matches: everyone is on 0 points with nothing played, so the
    // name settles the order. Records still come from SeasonStandings.
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Alice', 'Bob', 'Carol']);
    const bob = body.players[1];
    expect(bob.name).toBe('Bob');
    expect(bob.wins).toBe(8);
    expect(bob.losses).toBe(3);
    expect(bob.draws).toBe(0);

    expect(body.players[0].wins).toBe(5);

    // Carol has no season standings, so she gets 0-0-0
    expect(body.players[2].name).toBe('Carol');
    expect(body.players[2].wins).toBe(0);
    expect(body.players[2].losses).toBe(0);
    expect(body.players[2].draws).toBe(0);
    expect(body.players[0].recentForm).toEqual([]);
    expect(body.players[0].currentStreak).toEqual({ type: 'W', count: 0 });
  });

  it('gives 0-0-0 to players without season standings', async () => {
    mockSeasonStandingsListBySeason.mockResolvedValue([]); // no standings at all
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([
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

  it("ranks by points from that season's matches only", async () => {
    mockSeasonStandingsListBySeason.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 0, losses: 1, draws: 0 },
      { seasonId: 's1', playerId: 'p2', wins: 1, losses: 0, draws: 0 },
    ]);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([
      { matchId: 'm1', seasonId: 's1', winners: ['p2'], losers: ['p1'], participants: ['p1', 'p2'], date: '2026-02-01', updatedAt: '2026-02-01' },
      { matchId: 'm2', seasonId: 'other', winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'], date: '2026-03-01', updatedAt: '2026-03-01' },
      { matchId: 'm3', seasonId: 'other', winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'], date: '2026-03-02', updatedAt: '2026-03-02' },
    ]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'W1' },
      { playerId: 'p2', name: 'Bob', currentWrestler: 'W2' },
      { playerId: 'p3', name: 'Aaron', currentWrestler: 'W3' },
    ]);

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.rankedBy).toBe('points');
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Bob', 'Alice', 'Aaron']);
    expect(body.players[0]).toMatchObject({ points: 3, wins: 1, rank: 1 });
    expect(body.players[1]).toMatchObject({ points: 0, losses: 1, rank: 2 });
    // No season matches: 0-0-0 and last.
    expect(body.players[2]).toMatchObject({ points: 0, wins: 0, losses: 0, draws: 0, rank: 3 });
  });

  it('returns empty players when no players exist for a season', async () => {
    mockSeasonStandingsListBySeason.mockResolvedValue([]);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([]);

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.players).toEqual([]);
    expect(body.seasonId).toBe('s1');
  });

  it('calls seasonStandings.listBySeason with correct seasonId', async () => {
    mockSeasonStandingsListBySeason.mockResolvedValue([]);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([]);

    await getStandings(makeSeasonEvent('season-42'), ctx, cb);

    expect(mockSeasonStandingsListBySeason).toHaveBeenCalledTimes(1);
    expect(mockSeasonStandingsListBySeason).toHaveBeenCalledWith('season-42');
  });

  it('calls repository methods for overalls, matches, players, and seasonStandings', async () => {
    mockSeasonStandingsListBySeason.mockResolvedValue([]);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([]);

    await getStandings(makeSeasonEvent('s1'), ctx, cb);

    expect(mockOverallsListAll).toHaveBeenCalledTimes(1);
    expect(mockMatchesListCompleted).toHaveBeenCalledTimes(1);
    expect(mockPlayersList).toHaveBeenCalledTimes(1);
    expect(mockSeasonStandingsListBySeason).toHaveBeenCalledTimes(1);
  });

  it('handles standings with falsy wins/losses/draws (defaults to 0)', async () => {
    mockSeasonStandingsListBySeason.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 0, losses: 0, draws: 0 },
      { seasonId: 's1', playerId: 'p2', wins: undefined, losses: undefined, draws: undefined },
    ]);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([
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
    mockSeasonStandingsListBySeason.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 3, losses: 1, draws: 0 },
    ]);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([
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

  it('returns 500 when seasonStandings.listBySeason throws', async () => {
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockSeasonStandingsListBySeason.mockRejectedValue(new Error('DynamoDB query failed'));

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch standings');
  });

  it('returns 500 when players.list throws during season query', async () => {
    mockSeasonStandingsListBySeason.mockResolvedValue([]);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockRejectedValue(new Error('DynamoDB scan failed'));

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch standings');
  });
});
