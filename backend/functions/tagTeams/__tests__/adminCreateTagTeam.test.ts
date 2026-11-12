import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';
import type { TagTeam } from '../../../lib/repositories';
import { ConcurrencyError } from '../../../lib/repositories/errors';

const {
  mockPlayersFindById,
  mockListByPlayer,
  mockListByStatus,
  mockCreateNotifications,
  tx,
  mockRunInTransaction,
} = vi.hoisted(() => {
  const txMock = {
    createTagTeam: vi.fn(),
    updateTagTeam: vi.fn(),
    setPlayerTagTeamId: vi.fn(),
    updatePlayer: vi.fn(),
  };
  return {
    mockPlayersFindById: vi.fn(),
    mockListByPlayer: vi.fn(),
    mockListByStatus: vi.fn(),
    mockCreateNotifications: vi.fn(),
    tx: txMock,
    mockRunInTransaction: vi.fn(async (fn: (t: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };
});

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    roster: {
      players: { findById: mockPlayersFindById },
      tagTeams: { listByPlayer: mockListByPlayer, listByStatus: mockListByStatus },
    },
    runInTransaction: mockRunInTransaction,
  }),
}));

vi.mock('../../../lib/notifications', () => ({
  createNotifications: mockCreateNotifications,
}));

import { handler as adminCreateTagTeam, SUPERSEDED_REASON } from '../adminCreateTagTeam';

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(groups: string, body: unknown): APIGatewayProxyEvent {
  return {
    body: body === undefined ? null : JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/tag-teams/admin',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/tag-teams/admin',
    requestContext: {
      authorizer: { groups, username: 'gm', email: 'gm@test.com', principalId: 'gm-sub' },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

const players: Record<string, Record<string, unknown>> = {
  p1: { playerId: 'p1', name: 'Alice', currentWrestler: 'Bray Wyatt', userId: 'u1', wins: 0, losses: 0, draws: 0 },
  p2: { playerId: 'p2', name: 'Bob', currentWrestler: 'Erick Rowan', userId: 'u2', wins: 0, losses: 0, draws: 0 },
};

function team(overrides: Partial<TagTeam>): TagTeam {
  return {
    tagTeamId: 'tt-x',
    name: 'Some Team',
    player1Id: 'p1',
    player2Id: 'p9',
    status: 'active',
    wins: 0,
    losses: 0,
    draws: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const validBody = { name: 'The Wyatt Family', player1Id: 'p1', player2Id: 'p2' };

async function call(groups: string, body: unknown) {
  const res = await adminCreateTagTeam(makeEvent(groups, body), ctx, cb);
  if (!res) throw new Error('no response');
  return { statusCode: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> };
}

describe('adminCreateTagTeam (TTC-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayersFindById.mockImplementation(async (id: string) => players[id] ?? null);
    mockListByPlayer.mockResolvedValue([]);
    mockListByStatus.mockResolvedValue([]);
  });

  it('lets a Moderator create an active team with snapshotted wrestler names', async () => {
    const res = await call('Moderator', { ...validBody, imageUrl: 'https://img/x.png' });

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      name: 'The Wyatt Family',
      player1Id: 'p1',
      player2Id: 'p2',
      player1WrestlerName: 'Bray Wyatt',
      player2WrestlerName: 'Erick Rowan',
      imageUrl: 'https://img/x.png',
      status: 'active',
      wins: 0,
      supersededTagTeamIds: [],
    });
    expect(mockListByStatus).toHaveBeenCalledWith('active');
    expect(tx.createTagTeam).toHaveBeenCalledTimes(1);
    expect(tx.createTagTeam.mock.calls[0][0]).toMatchObject({ status: 'active', name: 'The Wyatt Family' });
  });

  it('sets tagTeamId on both players in the same transaction', async () => {
    const res = await call('Admin', validBody);

    expect(res.statusCode).toBe(201);
    expect(mockRunInTransaction).toHaveBeenCalledTimes(1);
    const tagTeamId = res.body.tagTeamId as string;
    expect(tx.setPlayerTagTeamId).toHaveBeenCalledWith('p1', tagTeamId);
    expect(tx.setPlayerTagTeamId).toHaveBeenCalledWith('p2', tagTeamId);
  });

  it('overwrites a stale tagTeamId that points at a team which is no longer active', async () => {
    mockPlayersFindById.mockImplementation(async (id: string) =>
      id === 'p1' ? { ...players.p1, tagTeamId: 'old-dissolved' } : players[id]);

    const res = await call('Moderator', validBody);

    expect(res.statusCode).toBe(201);
    expect(tx.updatePlayer).toHaveBeenCalledWith('p1', { tagTeamId: res.body.tagTeamId });
    expect(tx.setPlayerTagTeamId).toHaveBeenCalledWith('p2', res.body.tagTeamId);
  });

  it('returns 403 for a Wrestler', async () => {
    const res = await call('Wrestler', validBody);
    expect(res.statusCode).toBe(403);
    expect(mockRunInTransaction).not.toHaveBeenCalled();
  });

  it('returns 400 when the same player is given twice', async () => {
    const res = await call('Moderator', { ...validBody, player2Id: 'p1' });
    expect(res.statusCode).toBe(400);
    expect(mockPlayersFindById).not.toHaveBeenCalled();
  });

  it('returns 400 when a required field is missing', async () => {
    const res = await call('Moderator', { player1Id: 'p1', player2Id: 'p2' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 naming the missing player', async () => {
    const res = await call('Moderator', { ...validBody, player2Id: 'ghost' });
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ code: 'PLAYER_NOT_FOUND', playerId: 'ghost' });
  });

  it('returns 409 with the conflicting team when a player is already in an active team', async () => {
    mockListByPlayer.mockImplementation(async (id: string) =>
      id === 'p2' ? [team({ tagTeamId: 'tt-rowan', name: 'Bludgeon Brothers', player1Id: 'p2' })] : []);

    const res = await call('Moderator', validBody);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      code: 'PLAYER_IN_ACTIVE_TAG_TEAM',
      playerId: 'p2',
      conflictingTagTeam: { tagTeamId: 'tt-rowan', name: 'Bludgeon Brothers' },
    });
    expect(res.body.message).toContain('Bludgeon Brothers');
    expect(mockRunInTransaction).not.toHaveBeenCalled();
  });

  it('returns 409 when the player pointer names an active team', async () => {
    mockPlayersFindById.mockImplementation(async (id: string) =>
      id === 'p1' ? { ...players.p1, tagTeamId: 'tt-active' } : players[id]);
    mockListByStatus.mockResolvedValue([team({ tagTeamId: 'tt-active', name: 'Old Guard', player1Id: 'p7' })]);

    const res = await call('Moderator', validBody);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'PLAYER_IN_ACTIVE_TAG_TEAM', conflictingTagTeam: { name: 'Old Guard' } });
  });

  it('returns 409 when an active team already has the name, ignoring case', async () => {
    mockListByStatus.mockResolvedValue([team({ tagTeamId: 'tt-other', name: 'the wyatt FAMILY', player1Id: 'p7', player2Id: 'p8' })]);

    const res = await call('Moderator', validBody);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'TAG_TEAM_NAME_TAKEN', conflictingTagTeam: { tagTeamId: 'tt-other' } });
  });

  it('supersedes pending requests involving either player in the same transaction', async () => {
    mockListByPlayer.mockImplementation(async (id: string) => {
      if (id === 'p1') {
        return [
          team({ tagTeamId: 'pend-1', status: 'pending_partner', player2Id: 'p5' }),
          team({ tagTeamId: 'shared', status: 'pending_admin', player2Id: 'p2' }),
          team({ tagTeamId: 'old', status: 'dissolved' }),
        ];
      }
      return [team({ tagTeamId: 'shared', status: 'pending_admin', player2Id: 'p2' })];
    });

    const res = await call('Moderator', validBody);

    expect(res.statusCode).toBe(201);
    expect(res.body.supersededTagTeamIds).toEqual(['pend-1', 'shared']);
    expect(tx.updateTagTeam).toHaveBeenCalledTimes(2);
    for (const id of ['pend-1', 'shared']) {
      expect(tx.updateTagTeam).toHaveBeenCalledWith(id, expect.objectContaining({
        status: 'dissolved',
        rejectionReason: SUPERSEDED_REASON,
      }));
    }
  });

  it('notifies both players by default and skips when notifyPlayers is false', async () => {
    await call('Moderator', validBody);
    expect(mockCreateNotifications).toHaveBeenCalledTimes(1);
    const sent = mockCreateNotifications.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(sent.map((n) => n.userId)).toEqual(['u1', 'u2']);
    expect(sent[0]).toMatchObject({ type: 'tag_team_formed', sourceType: 'tag_team' });

    mockCreateNotifications.mockClear();
    await call('Moderator', { ...validBody, notifyPlayers: false });
    expect(mockCreateNotifications).not.toHaveBeenCalled();
  });

  it('returns 409 when a concurrent write beats the transaction', async () => {
    mockRunInTransaction.mockRejectedValueOnce(new ConcurrencyError('TagTeam', 'x'));
    const res = await call('Moderator', validBody);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'CONCURRENT_UPDATE' });
  });
});
