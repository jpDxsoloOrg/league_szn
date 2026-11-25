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
      points: 0,
      qualityWins: 0,
      streakBonuses: 0,
      sos: 0,
      rank: 1,
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
      // 5 wins plus one streak bonus at the third win.
      points: 16,
      qualityWins: 0,
      streakBonuses: 1,
      sos: 0,
      rank: 1,
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

// ─── Division league points (STR-03) ─────────────────────────────────

interface LeaguePlayerBody extends StandingsPlayerBody {
  points: number;
  qualityWins: number;
  rank: number;
  divisionRecord: StandingsPlayerBody['divisionRecord'] & {
    points: number;
    qualityWins: number;
    streakBonuses: number;
    sos: number;
    rank: number;
  };
}

function byId(players: StandingsPlayerBody[], playerId: string): LeaguePlayerBody {
  const player = players.find((candidate) => candidate.playerId === playerId);
  if (!player) throw new Error(`no row for ${playerId}`);
  return player as LeaguePlayerBody;
}

describe('getStandings — division league points (STR-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOverallsListAll.mockResolvedValue([]);
  });

  it('starts a mover at 0 division points, ranked below a member who has played', async () => {
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Aaron', currentWrestler: 'A', divisionId: 'd1', divisionJoinedAt: JOINED_AT, wins: 5, losses: 0, draws: 0 },
      { playerId: 'p3', name: 'Zed', currentWrestler: 'C', divisionId: 'd1', wins: 0, losses: 1, draws: 0 },
      { playerId: 'p2', name: 'Other', currentWrestler: 'B', divisionId: 'd2', wins: 0, losses: 6, draws: 0 },
    ]);
    mockMatchesListCompleted.mockResolvedValue([...careerWins, winFor('p2', 'p3', '2026-11-24T00:00:00.000Z')]);

    const players = await fetchPlayers();
    const mover = byId(players, 'p1');
    const member = byId(players, 'p3');

    // All-time: the mover's earlier wins still count.
    expect(mover).toMatchObject({ points: 16, rank: 1 });
    // Division: only results since joining, so 0 points and last.
    expect(mover.divisionRecord).toMatchObject({ wins: 0, points: 0, rank: 2 });
    expect(member.divisionRecord).toMatchObject({ losses: 1, points: 0, rank: 1 });
    // Each division ranks from 1.
    expect(byId(players, 'p2').divisionRecord.rank).toBe(1);
  });

  it("judges a quality win on the opponent's points in this division only", async () => {
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Mover', currentWrestler: 'A', divisionId: 'd1', divisionJoinedAt: JOINED_AT, wins: 2, losses: 1 },
      { playerId: 'p3', name: 'Member', currentWrestler: 'C', divisionId: 'd1', wins: 1, losses: 0 },
      { playerId: 'p2', name: 'Old rival', currentWrestler: 'B', divisionId: 'd2', wins: 0, losses: 2 },
    ]);
    mockMatchesListCompleted.mockResolvedValue([
      winFor('p1', 'p2', '2026-10-01T00:00:00.000Z'),
      winFor('p1', 'p2', '2026-10-02T00:00:00.000Z'),
      winFor('p3', 'p1', '2026-11-24T00:00:00.000Z'),
    ]);

    const member = byId(await fetchPlayers(), 'p3');

    // All-time the mover sat on 6 points, so beating them is a quality win.
    expect(member).toMatchObject({ points: 4, qualityWins: 1 });
    // In d1 the mover had 0 points when they met: no bonus.
    expect(member.divisionRecord).toMatchObject({ points: 3, qualityWins: 0, sos: 0, rank: 1 });
  });

  it('keeps the stored W-L-D for an unmoved player while points come from the matches', async () => {
    mockSeasonStandingsListBySeason.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 4, losses: 0, draws: 0 },
    ]);
    mockPlayersList.mockResolvedValue([{ playerId: 'p1', name: 'Unmoved', currentWrestler: 'A', divisionId: 'd1' }]);
    mockMatchesListCompleted.mockResolvedValue([winFor('p1', 'p2', '2026-10-01T00:00:00.000Z', { seasonId: 's1' })]);

    const [player] = await fetchPlayers({ seasonId: 's1' });

    expect((player as LeaguePlayerBody).divisionRecord).toMatchObject({ wins: 4, points: 3, rank: 1 });
  });
});
