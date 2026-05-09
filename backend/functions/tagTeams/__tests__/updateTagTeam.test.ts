import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const {
  mockTagTeamsFindById,
  mockTagTeamsUpdate,
  mockPlayersFindByUserId,
} = vi.hoisted(() => ({
  mockTagTeamsFindById: vi.fn(),
  mockTagTeamsUpdate: vi.fn(),
  mockPlayersFindByUserId: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    roster: {
      tagTeams: {
        findById: mockTagTeamsFindById,
        update: mockTagTeamsUpdate,
      },
      players: {
        findByUserId: mockPlayersFindByUserId,
      },
    },
  }),
}));

import { handler as updateTagTeam } from '../updateTagTeam';

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(
  groups: string,
  sub: string,
  body: unknown,
  pathParameters: Record<string, string> | null = { tagTeamId: 'tt1' },
): APIGatewayProxyEvent {
  return {
    body: body === undefined ? null : JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'PUT',
    isBase64Encoded: false,
    path: '/',
    pathParameters,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      authorizer: {
        groups,
        username: 'tester',
        email: 'tester@test.com',
        principalId: sub,
      },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

const baseTagTeam = {
  tagTeamId: 'tt1',
  name: 'The Brood',
  player1Id: 'p1',
  player2Id: 'p2',
  status: 'active' as const,
  wins: 0,
  losses: 0,
  draws: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

describe('updateTagTeam — TTP-01 wrestler persona fields', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists player1WrestlerName and player2WrestlerName when caller is a member', async () => {
    mockTagTeamsFindById.mockResolvedValue(baseTagTeam);
    mockPlayersFindByUserId.mockResolvedValue({ playerId: 'p1' });
    mockTagTeamsUpdate.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...baseTagTeam,
      ...patch,
    }));

    const event = makeEvent('Wrestler', 'user-sub-1', {
      name: 'The Brood',
      player1WrestlerName: 'Edge',
      player2WrestlerName: 'Christian',
    });

    const result = await updateTagTeam(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockTagTeamsUpdate).toHaveBeenCalledTimes(1);
    const [, patch] = mockTagTeamsUpdate.mock.calls[0];
    expect(patch.player1WrestlerName).toBe('Edge');
    expect(patch.player2WrestlerName).toBe('Christian');
    expect(patch.name).toBe('The Brood');
  });

  it('trims whitespace from wrestler-name overrides before persisting', async () => {
    mockTagTeamsFindById.mockResolvedValue(baseTagTeam);
    mockPlayersFindByUserId.mockResolvedValue({ playerId: 'p2' });
    mockTagTeamsUpdate.mockResolvedValue(baseTagTeam);

    const event = makeEvent('Wrestler', 'user-sub-2', {
      player1WrestlerName: '  Edge  ',
      player2WrestlerName: '  Christian  ',
    });

    const result = await updateTagTeam(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const [, patch] = mockTagTeamsUpdate.mock.calls[0];
    expect(patch.player1WrestlerName).toBe('Edge');
    expect(patch.player2WrestlerName).toBe('Christian');
  });

  it('omits the wrestler-name fields when submitted empty so the existing override is preserved', async () => {
    mockTagTeamsFindById.mockResolvedValue(baseTagTeam);
    mockPlayersFindByUserId.mockResolvedValue({ playerId: 'p1' });
    mockTagTeamsUpdate.mockResolvedValue(baseTagTeam);

    const event = makeEvent('Wrestler', 'user-sub-1', {
      name: 'New Name',
      player1WrestlerName: '',
      player2WrestlerName: '   ',
    });

    const result = await updateTagTeam(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const [, patch] = mockTagTeamsUpdate.mock.calls[0];
    expect(patch.name).toBe('New Name');
    expect(patch).not.toHaveProperty('player1WrestlerName');
    expect(patch).not.toHaveProperty('player2WrestlerName');
  });

  it('returns 403 when caller is neither a tag-team member nor an admin', async () => {
    mockTagTeamsFindById.mockResolvedValue(baseTagTeam);
    mockPlayersFindByUserId.mockResolvedValue({ playerId: 'outsider' });

    const event = makeEvent('Wrestler', 'user-sub-3', {
      player1WrestlerName: 'Should Fail',
    });

    const result = await updateTagTeam(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
    expect(mockTagTeamsUpdate).not.toHaveBeenCalled();
  });

  it('allows an admin who is not a member to set the override', async () => {
    mockTagTeamsFindById.mockResolvedValue(baseTagTeam);
    mockTagTeamsUpdate.mockResolvedValue(baseTagTeam);

    const event = makeEvent('Admin', 'admin-sub', {
      player1WrestlerName: 'Stone Cold',
    });

    const result = await updateTagTeam(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockPlayersFindByUserId).not.toHaveBeenCalled();
    const [, patch] = mockTagTeamsUpdate.mock.calls[0];
    expect(patch.player1WrestlerName).toBe('Stone Cold');
  });

  it('returns 400 when the body has no recognised fields to update', async () => {
    mockTagTeamsFindById.mockResolvedValue(baseTagTeam);
    mockPlayersFindByUserId.mockResolvedValue({ playerId: 'p1' });

    const event = makeEvent('Wrestler', 'user-sub-1', {
      player1WrestlerName: '',
      player2WrestlerName: '',
    });

    const result = await updateTagTeam(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(mockTagTeamsUpdate).not.toHaveBeenCalled();
  });
});
