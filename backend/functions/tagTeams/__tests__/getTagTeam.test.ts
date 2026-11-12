import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const {
  mockTagTeamsFindById,
  mockTagTeamsListByStatus,
  mockPlayersFindById,
  mockMatchesListCompleted,
  mockListAllHistory,
  mockChampionshipsList,
} = vi.hoisted(() => ({
  mockListAllHistory: vi.fn(),
  mockChampionshipsList: vi.fn(),
  mockTagTeamsFindById: vi.fn(),
  mockTagTeamsListByStatus: vi.fn(),
  mockPlayersFindById: vi.fn(),
  mockMatchesListCompleted: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    roster: {
      tagTeams: {
        findById: mockTagTeamsFindById,
        listByStatus: mockTagTeamsListByStatus,
      },
      players: {
        findById: mockPlayersFindById,
      },
    },
    competition: {
      matches: {
        listCompleted: mockMatchesListCompleted,
      },
      championships: {
        listAllHistory: mockListAllHistory,
        list: mockChampionshipsList,
      },
    },
  }),
}));

import { handler as getTagTeam } from '../getTagTeam';

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(tagTeamId = 'tt1'): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/',
    pathParameters: { tagTeamId },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {} as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

const player1 = {
  playerId: 'p1',
  name: 'Adam',
  currentWrestler: 'Edge (solo)',
  imageUrl: undefined,
  psnId: undefined,
};

const player2 = {
  playerId: 'p2',
  name: 'Jay',
  currentWrestler: 'Christian (solo)',
  imageUrl: undefined,
  psnId: undefined,
};

describe('getTagTeam — TTP-01 wrestler-name fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTagTeamsListByStatus.mockResolvedValue([]);
    mockMatchesListCompleted.mockResolvedValue([]);
    mockListAllHistory.mockResolvedValue([]);
    mockChampionshipsList.mockResolvedValue([]);
    mockPlayersFindById.mockImplementation(async (id: string) => {
      if (id === 'p1') return player1;
      if (id === 'p2') return player2;
      return null;
    });
  });

  it('uses tagTeam.playerNWrestlerName when the override is set', async () => {
    mockTagTeamsFindById.mockResolvedValue({
      tagTeamId: 'tt1',
      name: 'The Brood',
      player1Id: 'p1',
      player2Id: 'p2',
      player1WrestlerName: 'Brood Edge',
      player2WrestlerName: 'Brood Christian',
      status: 'active',
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: '',
      updatedAt: '',
    });

    const result = await getTagTeam(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.player1.wrestlerName).toBe('Brood Edge');
    expect(body.player2.wrestlerName).toBe('Brood Christian');
  });

  it('falls back to the player solo currentWrestler when the override is unset', async () => {
    mockTagTeamsFindById.mockResolvedValue({
      tagTeamId: 'tt1',
      name: 'The Brood',
      player1Id: 'p1',
      player2Id: 'p2',
      status: 'active',
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: '',
      updatedAt: '',
    });

    const result = await getTagTeam(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.player1.wrestlerName).toBe('Edge (solo)');
    expect(body.player2.wrestlerName).toBe('Christian (solo)');
  });

  it('falls back to currentWrestler when the override is an empty string', async () => {
    mockTagTeamsFindById.mockResolvedValue({
      tagTeamId: 'tt1',
      name: 'The Brood',
      player1Id: 'p1',
      player2Id: 'p2',
      player1WrestlerName: '',
      player2WrestlerName: '',
      status: 'active',
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: '',
      updatedAt: '',
    });

    const result = await getTagTeam(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.player1.wrestlerName).toBe('Edge (solo)');
    expect(body.player2.wrestlerName).toBe('Christian (solo)');
  });


  it('derives the record from the same matches as the streak and breakdown', async () => {
    mockTagTeamsFindById.mockResolvedValue({
      tagTeamId: 'tt1',
      name: 'Brothers',
      player1Id: 'p1',
      player2Id: 'p2',
      status: 'active',
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: '',
      updatedAt: '',
    });
    mockMatchesListCompleted.mockResolvedValue([
      { matchId: 'm1', date: '2025-01-01', matchFormat: 'tag', participants: ['p1', 'p2', 'x', 'y'], teams: [['p1', 'p2'], ['x', 'y']], winners: ['p1', 'p2'], losers: ['x', 'y'], status: 'completed' },
      { matchId: 'm2', date: '2025-01-02', matchFormat: 'tag', participants: ['p1', 'p2', 'x', 'y'], teams: [['p1', 'p2'], ['x', 'y']], winners: ['x', 'y'], losers: ['p1', 'p2'], status: 'completed' },
      { matchId: 'm3', date: '2025-01-03', matchFormat: 'tag', participants: ['p1', 'p2', 'x', 'y'], teams: [['p1', 'p2'], ['x', 'y']], winners: ['p1', 'p2'], losers: ['x', 'y'], status: 'completed' },
    ]);

    const result = await getTagTeam(makeEvent(), ctx, cb);

    const body = JSON.parse(result!.body);
    expect([body.wins, body.losses, body.draws]).toEqual([2, 1, 0]);
    expect(body.standings.winPercentage).toBe(66.7);
    expect(body.standings.currentStreak).toEqual({ type: 'W', count: 1 });
    expect(body.matchTypeRecords).toEqual([{ matchFormat: 'tag', wins: 2, losses: 1, draws: 0 }]);
  });

  it('lists the title reigns linked to this team, newest first (TTC-10)', async () => {
    mockTagTeamsFindById.mockResolvedValue({
      tagTeamId: 'tt1', name: 'Brothers', player1Id: 'p1', player2Id: 'p2',
      status: 'active', wins: 0, losses: 0, draws: 0, createdAt: '', updatedAt: '',
    });
    mockChampionshipsList.mockResolvedValue([{ championshipId: 'c1', name: 'Tag Titles', type: 'tag' }]);
    mockListAllHistory.mockResolvedValue([
      { championshipId: 'c1', wonDate: '2024-01-01T00:00:00Z', champion: ['p1', 'p2'], tagTeamId: 'tt1', lostDate: '2024-03-01T00:00:00Z', daysHeld: 60, defenses: 2 },
      { championshipId: 'c1', wonDate: '2024-06-01T00:00:00Z', champion: ['p1', 'p2'], tagTeamId: 'tt1' },
      { championshipId: 'c1', wonDate: '2024-03-01T00:00:00Z', champion: ['x', 'y'], tagTeamId: 'tt2' },
      { championshipId: 'c1', wonDate: '2023-01-01T00:00:00Z', champion: ['p1', 'p2'] },
    ]);

    const result = await getTagTeam(makeEvent(), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.titleReigns).toEqual([
      { championshipId: 'c1', championshipName: 'Tag Titles', wonDate: '2024-06-01T00:00:00Z', defenses: 0 },
      {
        championshipId: 'c1', championshipName: 'Tag Titles', wonDate: '2024-01-01T00:00:00Z',
        lostDate: '2024-03-01T00:00:00Z', daysHeld: 60, defenses: 2,
      },
    ]);
  });

  it('still returns the team when title reigns fail to load', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockTagTeamsFindById.mockResolvedValue({
      tagTeamId: 'tt1', name: 'Brothers', player1Id: 'p1', player2Id: 'p2',
      status: 'active', wins: 0, losses: 0, draws: 0, createdAt: '', updatedAt: '',
    });
    mockListAllHistory.mockRejectedValue(new Error('boom'));

    const result = await getTagTeam(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).titleReigns).toEqual([]);
  });
});
