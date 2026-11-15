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
  ListGroupsCommand: vi.fn((p: Record<string, unknown>) => ({ _type: 'ListGroups', ...p })),
  ListUsersInGroupCommand: vi.fn((p: Record<string, unknown>) => ({ _type: 'ListUsersInGroup', ...p })),
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

/** Answers Cognito by command type: the pool's users, then each group's members. */
function mockCognito(
  users: Array<{ username: string; sub: string; groups: string[] }>,
) {
  const groupNames = [...new Set(users.flatMap((u) => u.groups))];
  mockSend.mockImplementation(async (command: { _type: string; GroupName?: string }) => {
    switch (command._type) {
      case 'ListUsers':
        return {
          Users: users.map((u) => ({ Username: u.username, Attributes: [{ Name: 'sub', Value: u.sub }] })),
        };
      case 'ListGroups':
        return { Groups: groupNames.map((GroupName) => ({ GroupName })) };
      case 'ListUsersInGroup':
        return {
          Users: users.filter((u) => u.groups.includes(command.GroupName ?? '')).map((u) => ({ Username: u.username })),
        };
      default:
        throw new Error(`unexpected command ${command._type}`);
    }
  });
}

describe('syncWrestlerRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
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

  it('writes nothing when a group listing fails, so nobody is demoted on a partial read', async () => {
    mockCognito([{ username: 'wrestler', sub: 'sub-w', groups: ['Wrestler'] }]);
    mockSend.mockImplementation(async (command: { _type: string }) => {
      if (command._type === 'ListUsersInGroup') throw new Error('throttled');
      if (command._type === 'ListGroups') return { Groups: [{ GroupName: 'Wrestler' }] };
      return { Users: [{ Username: 'wrestler', Attributes: [{ Name: 'sub', Value: 'sub-w' }] }] };
    });
    mockPlayersList.mockResolvedValue([
      { playerId: 'p-w', userId: 'sub-w', hasWrestlerRole: true },
    ]);

    const result = await syncWrestlerRoles(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(mockPlayersUpdate).not.toHaveBeenCalled();
  });

  it('follows Cognito pagination for users and group members', async () => {
    mockSend.mockImplementation(async (command: { _type: string; PaginationToken?: string; NextToken?: string }) => {
      switch (command._type) {
        case 'ListUsers':
          return command.PaginationToken
            ? { Users: [{ Username: 'b', Attributes: [{ Name: 'sub', Value: 'sub-b' }] }] }
            : { Users: [{ Username: 'a', Attributes: [{ Name: 'sub', Value: 'sub-a' }] }], PaginationToken: 'next' };
        case 'ListGroups':
          return { Groups: [{ GroupName: 'Wrestler' }] };
        case 'ListUsersInGroup':
          return command.NextToken ? { Users: [{ Username: 'b' }] } : { Users: [{ Username: 'a' }], NextToken: 'more' };
        default:
          throw new Error(`unexpected command ${command._type}`);
      }
    });
    mockPlayersList.mockResolvedValue([
      { playerId: 'p-a', userId: 'sub-a' },
      { playerId: 'p-b', userId: 'sub-b' },
    ]);

    const result = await syncWrestlerRoles(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(body(result)).toMatchObject({ granted: 2 });
    expect(body(result)).not.toHaveProperty('skipped');
  });

  it('returns 500 when Cognito fails', async () => {
    mockSend.mockRejectedValue(new Error('Cognito down'));

    const result = await syncWrestlerRoles(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(body(result).message).toBe('Failed to sync wrestler roles');
  });
});
