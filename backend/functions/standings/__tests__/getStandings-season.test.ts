import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const {
  mockOverallsListAll,
  mockMatchesListCompleted,
  mockPlayersList,
  mockSeasonStandingsListBySeason,
  mockSeasonsFindActive,
} = vi.hoisted(() => ({
  mockOverallsListAll: vi.fn(),
  mockMatchesListCompleted: vi.fn(),
  mockPlayersList: vi.fn(),
  mockSeasonStandingsListBySeason: vi.fn(),
  mockSeasonsFindActive: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    roster: {
      overalls: { listAll: mockOverallsListAll },
      players: { list: mockPlayersList },
    },
    competition: { matches: { listCompleted: mockMatchesListCompleted } },
    season: {
      standings: { listBySeason: mockSeasonStandingsListBySeason },
      seasons: { findActive: mockSeasonsFindActive },
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

function makeSeasonEvent(seasonId: string): APIGatewayProxyEvent {
  return makeEvent({
    queryStringParameters: { seasonId },
  });
}

/**
 * Season views hide wrestlers who did not compete in that season. Tests below
 * that are about merging/sorting rather than the active filter opt out of it.
 */
function makeSeasonEventAll(seasonId: string): APIGatewayProxyEvent {
  return makeEvent({
    queryStringParameters: { seasonId, includeInactive: 'true' },
  });
}

// ─── Season-specific standings ───────────────────────────────────────

describe('getStandings — season-specific (with seasonId)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSeasonsFindActive.mockResolvedValue(null);
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

    const result = await getStandings(makeSeasonEventAll('s1'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Alice', 'Unsynced']);
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

    const result = await getStandings(makeSeasonEventAll('s1'), ctx, cb);

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
    mockSeasonStandingsListBySeason.mockResolvedValue([]); // no standings at all
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'W1' },
      { playerId: 'p2', name: 'Bob', currentWrestler: 'W2' },
    ]);

    const result = await getStandings(makeSeasonEventAll('s1'), ctx, cb);

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
    mockSeasonStandingsListBySeason.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 5, losses: 4, draws: 0 },
      { seasonId: 's1', playerId: 'p2', wins: 5, losses: 1, draws: 0 },
      { seasonId: 's1', playerId: 'p3', wins: 7, losses: 3, draws: 0 },
    ]);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([
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

    const result = await getStandings(makeSeasonEventAll('s1'), ctx, cb);

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

  // ── Active / inactive filtering ──────────────────────────────────

  it('hides wrestlers who have not competed in the current season', async () => {
    mockSeasonsFindActive.mockResolvedValue({ seasonId: 's1', status: 'active' });
    mockSeasonStandingsListBySeason.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 2, losses: 0, draws: 0 },
    ]);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Active', currentWrestler: 'W1', lastActiveSeasonId: 's1' },
      { playerId: 'p2', name: 'Idle', currentWrestler: 'W2', lastActiveSeasonId: 's0' },
      { playerId: 'p3', name: 'NeverWrestled', currentWrestler: 'W3' },
    ]);

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Active']);
    expect(body.activeFiltered).toBe(true);
  });

  it('honours an admin override for the current season', async () => {
    mockSeasonsFindActive.mockResolvedValue({ seasonId: 's1', status: 'active' });
    mockSeasonStandingsListBySeason.mockResolvedValue([]);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([
      {
        playerId: 'p1',
        name: 'Forced In',
        currentWrestler: 'W1',
        activeOverride: { seasonId: 's1', value: true, setBy: 'admin', setAt: 'now' },
      },
      {
        playerId: 'p2',
        name: 'Forced Out',
        currentWrestler: 'W2',
        lastActiveSeasonId: 's1',
        activeOverride: { seasonId: 's1', value: false, setBy: 'admin', setAt: 'now' },
      },
      {
        playerId: 'p3',
        name: 'Stale Override',
        currentWrestler: 'W3',
        activeOverride: { seasonId: 's0', value: true, setBy: 'admin', setAt: 'now' },
      },
    ]);

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Forced In']);
  });

  it('returns inactive wrestlers flagged when includeInactive=true', async () => {
    mockSeasonsFindActive.mockResolvedValue({ seasonId: 's1', status: 'active' });
    mockSeasonStandingsListBySeason.mockResolvedValue([]);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Active', currentWrestler: 'W1', lastActiveSeasonId: 's1' },
      { playerId: 'p2', name: 'Idle', currentWrestler: 'W2' },
    ]);

    const result = await getStandings(makeSeasonEventAll('s1'), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.players).toHaveLength(2);
    expect(body.players.find((p: { name: string }) => p.name === 'Active').isActive).toBe(true);
    expect(body.players.find((p: { name: string }) => p.name === 'Idle').isActive).toBe(false);
    expect(body.activeFiltered).toBe(false);
  });

  it('falls back to season standings for a past season, ignoring the current flag', async () => {
    mockSeasonsFindActive.mockResolvedValue({ seasonId: 's2', status: 'active' });
    mockSeasonStandingsListBySeason.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 4, losses: 1, draws: 0 },
      { seasonId: 's1', playerId: 'p3', wins: 0, losses: 0, draws: 0 },
    ]);
    mockOverallsListAll.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([
      // Competed in s1, inactive now — still belongs in the s1 table.
      { playerId: 'p1', name: 'Veteran', currentWrestler: 'W1' },
      // Active now, but never wrestled in s1.
      { playerId: 'p2', name: 'Newcomer', currentWrestler: 'W2', lastActiveSeasonId: 's2' },
      // Has an s1 standings row but never actually competed.
      { playerId: 'p3', name: 'Ghost', currentWrestler: 'W3' },
    ]);

    const result = await getStandings(makeSeasonEvent('s1'), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Veteran']);
  });
});

// ─── Error handling (season path) ────────────────────────────────────

describe('getStandings — error handling (season)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSeasonsFindActive.mockResolvedValue(null);
  });

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
