import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const {
  mockTagTeamsFindById,
  mockTagTeamsListByStatus,
  mockPlayersFindById,
  mockMatchesListCompleted,
} = vi.hoisted(() => ({
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
});
