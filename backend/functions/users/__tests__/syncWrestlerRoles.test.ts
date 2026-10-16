import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const { mockSend, mockPlayersList, mockPlayersUpdate } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockPlayersList: vi.fn(),
  mockPlayersUpdate: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    roster: {
      players: { list: mockPlayersList, update: mockPlayersUpdate },
    },
  }),
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: mockSend })),
  ListUsersCommand: vi.fn((p: Record<string, unknown>) => ({ _type: 'ListUsers', ...p })),
  AdminListGroupsForUserCommand: vi.fn((p: Record<string, unknown>) => ({ _type: 'AdminListGroups', ...p })),
}));

import { handler as syncWrestlerRoles } from '../syncWrestlerRoles';

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(groups = 'Admin'): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'POST',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: {
      authorizer: {
        groups,
        username: 'adminuser',
        email: 'admin@test.com',
        principalId: 'admin-sub',
      },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

const body = (r: Awaited<ReturnType<typeof syncWrestlerRoles>>) =>
  JSON.parse((r as { body: string }).body);

/** One ListUsers page, then one AdminListGroups reply per user, in order. */
function mockCognito(
  users: Array<{ username: string; sub: string; groups: string[] }>,
) {
  mockSend.mockResolvedValueOnce({
    Users: users.map((u) => ({
      Username: u.username,
      Attributes: [{ Name: 'sub', Value: u.sub }],
    })),
  });
  for (const u of users) {
    mockSend.mockResolvedValueOnce({
      Groups: u.groups.map((g) => ({ GroupName: g })),
    });
  }
}

describe('syncWrestlerRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayersUpdate.mockResolvedValue({});
  });

  it('returns 403 if caller is not Admin', async () => {
    const result = await syncWrestlerRoles(makeEvent('Wrestler'), ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('stamps true for wrestlers and false for everyone else', async () => {
    mockCognito([
      { username: 'wrestler', sub: 'sub-w', groups: ['Wrestler'] },
      { username: 'admin', sub: 'sub-a', groups: ['Admin'] },
    ]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p-w', userId: 'sub-w' },
      { playerId: 'p-a', userId: 'sub-a' },
    ]);

    const result = await syncWrestlerRoles(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockPlayersUpdate).toHaveBeenCalledWith('p-w', { hasWrestlerRole: true });
    expect(mockPlayersUpdate).toHaveBeenCalledWith('p-a', { hasWrestlerRole: false });
    expect(body(result)).toMatchObject({ totalPlayers: 2, granted: 1, revoked: 1 });
  });

  it('hides players with no linked Cognito account', async () => {
    mockCognito([{ username: 'wrestler', sub: 'sub-w', groups: ['Wrestler'] }]);
    mockPlayersList.mockResolvedValue([{ playerId: 'p-orphan' }]);

    const result = await syncWrestlerRoles(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockPlayersUpdate).toHaveBeenCalledWith('p-orphan', { hasWrestlerRole: false });
    expect(body(result)).toMatchObject({ revoked: 1 });
  });

  it('does not rewrite players whose flag already matches', async () => {
    mockCognito([{ username: 'wrestler', sub: 'sub-w', groups: ['Wrestler'] }]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p-w', userId: 'sub-w', hasWrestlerRole: true },
    ]);

    const result = await syncWrestlerRoles(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockPlayersUpdate).not.toHaveBeenCalled();
    expect(body(result)).toMatchObject({ unchanged: 1, granted: 0, revoked: 0 });
  });

  it('skips a player whose group lookup failed rather than demoting them', async () => {
    mockSend.mockResolvedValueOnce({
      Users: [{ Username: 'wrestler', Attributes: [{ Name: 'sub', Value: 'sub-w' }] }],
    });
    mockSend.mockRejectedValueOnce(new Error('throttled'));
    mockPlayersList.mockResolvedValue([
      { playerId: 'p-w', userId: 'sub-w', hasWrestlerRole: true },
    ]);

    const result = await syncWrestlerRoles(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockPlayersUpdate).not.toHaveBeenCalled();
    expect(body(result)).toMatchObject({ skipped: 1 });
  });

  it('follows Cognito pagination', async () => {
    mockSend.mockResolvedValueOnce({
      Users: [{ Username: 'a', Attributes: [{ Name: 'sub', Value: 'sub-a' }] }],
      PaginationToken: 'next',
    });
    mockSend.mockResolvedValueOnce({
      Users: [{ Username: 'b', Attributes: [{ Name: 'sub', Value: 'sub-b' }] }],
    });
    mockSend.mockResolvedValue({ Groups: [{ GroupName: 'Wrestler' }] });
    mockPlayersList.mockResolvedValue([
      { playerId: 'p-a', userId: 'sub-a' },
      { playerId: 'p-b', userId: 'sub-b' },
    ]);

    const result = await syncWrestlerRoles(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(body(result)).toMatchObject({ granted: 2 });
  });

  it('hides a player whose linked account no longer exists in Cognito', async () => {
    mockCognito([{ username: 'wrestler', sub: 'sub-w', groups: ['Wrestler'] }]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p-stale', userId: 'sub-deleted', hasWrestlerRole: true },
    ]);

    const result = await syncWrestlerRoles(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    // Not "skipped" — the account is gone, not merely unreadable.
    expect(mockPlayersUpdate).toHaveBeenCalledWith('p-stale', { hasWrestlerRole: false });
    expect(body(result)).toMatchObject({ revoked: 1, skipped: 0 });
  });

  it('handles a production-sized pool without per-user quadratic work', async () => {
    const users = Array.from({ length: 45 }, (_, i) => ({
      username: `u${i}`,
      sub: `sub-${i}`,
      groups: i % 3 === 0 ? ['Wrestler'] : ['Admin'],
    }));
    mockCognito(users);
    mockPlayersList.mockResolvedValue(
      users.map((u, i) => ({ playerId: `p-${i}`, userId: u.sub })),
    );

    const result = await syncWrestlerRoles(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    // One ListUsers page + exactly one group lookup per user.
    expect(mockSend).toHaveBeenCalledTimes(1 + users.length);
    expect(mockPlayersUpdate).toHaveBeenCalledTimes(45);
    expect(body(result)).toMatchObject({ totalPlayers: 45, granted: 15, revoked: 30 });
  });

  it('returns 500 when Cognito fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('Cognito down'));

    const result = await syncWrestlerRoles(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(body(result).message).toBe('Failed to sync wrestler roles');
  });
});
