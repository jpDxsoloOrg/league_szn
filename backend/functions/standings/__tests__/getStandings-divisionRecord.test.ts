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
    competition: { matches: { listCompleted: mockMatchesListCompleted } },
    season: { standings: { listBySeason: mockSeasonStandingsListBySeason } },
  }),
}));

import { handler as getStandings } from '../getStandings';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(queryStringParameters: Record<string, string> | null = null): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

interface TestMatch {
  matchId: string;
  date: string;
  completedAt?: string;
  updatedAt: string;
  seasonId?: string;
  participants: string[];
  winners: string[];
  losers: string[];
}

function winFor(winner: string, loser: string, date: string, extra: Partial<TestMatch> = {}): TestMatch {
  return {
    matchId: `${winner}-${loser}-${date}`,
    date,
    updatedAt: extra.completedAt ?? date,
    participants: [winner, loser],
    winners: [winner],
    losers: [loser],
    ...extra,
  };
}

interface StandingsPlayerBody {
  playerId: string;
  wins: number;
  losses: number;
  draws: number;
  divisionRecord: {
    wins: number;
    losses: number;
    draws: number;
    recentForm: string[];
    currentStreak: { type: string; count: number };
    since?: string;
  };
}

async function fetchPlayers(query: Record<string, string> | null = null): Promise<StandingsPlayerBody[]> {
  const result = await getStandings(makeEvent(query), ctx, cb);
  expect(result!.statusCode).toBe(200);
  return JSON.parse(result!.body).players;
}

const JOINED_AT = '2026-11-23T12:00:00.000Z';
const careerWins = [
  winFor('p1', 'p2', '2026-10-01T00:00:00.000Z'),
  winFor('p1', 'p2', '2026-10-02T00:00:00.000Z'),
  winFor('p1', 'p2', '2026-10-03T00:00:00.000Z'),
  winFor('p1', 'p2', '2026-10-04T00:00:00.000Z'),
  winFor('p1', 'p2', '2026-10-05T00:00:00.000Z'),
];

// ─── Division record ─────────────────────────────────────────────────

describe('getStandings — divisionRecord (PRL-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOverallsListAll.mockResolvedValue([]);
  });

  it('starts a newly promoted player at 0-0-0 while the career record keeps its wins', async () => {
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Promoted', currentWrestler: 'A', wins: 5, losses: 0, draws: 0, divisionJoinedAt: JOINED_AT },
    ]);
    mockMatchesListCompleted.mockResolvedValue(careerWins);

    const [player] = await fetchPlayers();

    expect(player.wins).toBe(5);
    expect(player.divisionRecord).toEqual({
      wins: 0,
      losses: 0,
      draws: 0,
      recentForm: [],
      currentStreak: { type: 'W', count: 0 },
      since: JOINED_AT,
    });
  });

  it('counts a win after joining as 1-0-0 with a W1 streak', async () => {
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Promoted', currentWrestler: 'A', wins: 6, losses: 0, draws: 0, divisionJoinedAt: JOINED_AT },
    ]);
    mockMatchesListCompleted.mockResolvedValue([...careerWins, winFor('p1', 'p3', '2026-11-24T00:00:00.000Z')]);

    const [player] = await fetchPlayers();

    expect(player.divisionRecord).toMatchObject({
      wins: 1,
      losses: 0,
      draws: 0,
      recentForm: ['W'],
      currentStreak: { type: 'W', count: 1 },
    });
  });

  it('counts a match booked before the move but completed after it', async () => {
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Promoted', currentWrestler: 'A', wins: 0, losses: 1, draws: 0, divisionJoinedAt: JOINED_AT },
    ]);
    mockMatchesListCompleted.mockResolvedValue([
      winFor('p3', 'p1', '2026-11-20T00:00:00.000Z', { completedAt: '2026-11-24T00:00:00.000Z' }),
    ]);

    const [player] = await fetchPlayers();

    expect(player.divisionRecord).toMatchObject({ wins: 0, losses: 1, draws: 0, recentForm: ['L'] });
  });

  it('gives a player who never moved their full record, with no since', async () => {
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Unmoved', currentWrestler: 'A', wins: 5, losses: 0, draws: 0 },
    ]);
    mockMatchesListCompleted.mockResolvedValue(careerWins);

    const [player] = await fetchPlayers();

    expect(player.divisionRecord).toEqual({
      wins: 5,
      losses: 0,
      draws: 0,
      recentForm: ['W', 'W', 'W', 'W', 'W'],
      currentStreak: { type: 'W', count: 5 },
    });
  });

  it('applies the season filter on top of the join date', async () => {
    mockSeasonStandingsListBySeason.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 3, losses: 0, draws: 0 },
    ]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Promoted', currentWrestler: 'A', divisionJoinedAt: JOINED_AT },
    ]);
    mockMatchesListCompleted.mockResolvedValue([
      winFor('p1', 'p2', '2026-10-01T00:00:00.000Z', { seasonId: 's1' }),
      winFor('p1', 'p2', '2026-10-02T00:00:00.000Z', { seasonId: 's1' }),
      winFor('p1', 'p2', '2026-11-24T00:00:00.000Z', { seasonId: 's1' }),
      winFor('p2', 'p1', '2026-11-24T06:00:00.000Z', { seasonId: 'other' }),
    ]);

    const [player] = await fetchPlayers({ seasonId: 's1' });

    expect(player.wins).toBe(3);
    expect(player.divisionRecord).toMatchObject({
      wins: 1,
      losses: 0,
      draws: 0,
      recentForm: ['W'],
      currentStreak: { type: 'W', count: 1 },
      since: JOINED_AT,
    });
  });

  it('uses the season record for an unmoved player in a season view', async () => {
    mockSeasonStandingsListBySeason.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 2, losses: 1, draws: 0 },
    ]);
    mockPlayersList.mockResolvedValue([{ playerId: 'p1', name: 'Unmoved', currentWrestler: 'A' }]);
    mockMatchesListCompleted.mockResolvedValue([]);

    const [player] = await fetchPlayers({ seasonId: 's1' });

    expect(player.divisionRecord).toMatchObject({ wins: 2, losses: 1, draws: 0 });
    expect(player.divisionRecord.since).toBeUndefined();
  });
});
