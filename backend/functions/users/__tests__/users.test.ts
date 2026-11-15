import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Hoisted mocks ──────────────────────────────────────────────────

const {
  mockSend,
  mockPlayersFindByUserId,
  mockPlayersCreate,
  mockPlayersUpdate,
  mockPlayersList,
} = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockPlayersFindByUserId: vi.fn(),
  mockPlayersCreate: vi.fn(),
  mockPlayersUpdate: vi.fn(),
  mockPlayersList: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    roster: {
      players: {
        findByUserId: mockPlayersFindByUserId,
        create: mockPlayersCreate,
        update: mockPlayersUpdate,
        list: mockPlayersList,
      },
    },
  }),
}));

vi.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: mockSend })),
  ListUsersCommand: vi.fn((p: Record<string, unknown>) => ({ _type: 'ListUsers', ...p })),
  ListGroupsCommand: vi.fn((p: Record<string, unknown>) => ({ _type: 'ListGroups', ...p })),
  ListUsersInGroupCommand: vi.fn((p: Record<string, unknown>) => ({ _type: 'ListUsersInGroup', ...p })),
  AdminListGroupsForUserCommand: vi.fn((p: Record<string, unknown>) => ({ _type: 'AdminListGroups', ...p })),
  AdminEnableUserCommand: vi.fn((p: Record<string, unknown>) => ({ _type: 'AdminEnable', ...p })),
  AdminDisableUserCommand: vi.fn((p: Record<string, unknown>) => ({ _type: 'AdminDisable', ...p })),
  AdminAddUserToGroupCommand: vi.fn((p: Record<string, unknown>) => ({ _type: 'AdminAddGroup', ...p })),
  AdminRemoveUserFromGroupCommand: vi.fn((p: Record<string, unknown>) => ({ _type: 'AdminRemoveGroup', ...p })),
  AdminGetUserCommand: vi.fn((p: Record<string, unknown>) => ({ _type: 'AdminGetUser', ...p })),
}));

import { handler as listUsers } from '../listUsers';
import { handler as toggleUserEnabled } from '../toggleUserEnabled';
import { handler as updateUserRole } from '../updateUserRole';

// ─── Helpers ────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'GET',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'], ...overrides,
  };
}

function withAuth(event: APIGatewayProxyEvent, groups: string, sub = 'admin-sub'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'adminuser', email: 'admin@test.com', principalId: sub },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

const body = (r: unknown) => JSON.parse((r as { body: string })!.body);

// ─── listUsers ──────────────────────────────────────────────────────

interface DirectoryUser {
  Username: string;
  Attributes?: Array<{ Name: string; Value: string }>;
  Enabled?: boolean;
  UserStatus?: string;
  UserCreateDate?: Date;
}

/**
 * Answers Cognito by command type: the pool's users for ListUsers, the group
 * names for ListGroups, and each group's members for ListUsersInGroup.
 */
function mockDirectory(users: DirectoryUser[], members: Record<string, string[]>) {
  mockSend.mockImplementation(async (command: { _type: string; GroupName?: string }) => {
    switch (command._type) {
      case 'ListUsers':
        return { Users: users };
      case 'ListGroups':
        return { Groups: Object.keys(members).map((GroupName) => ({ GroupName })) };
      case 'ListUsersInGroup':
        return { Users: (members[command.GroupName ?? ''] ?? []).map((Username) => ({ Username })) };
      default:
        throw new Error(`unexpected command ${command._type}`);
    }
  });
}

const sentTypes = () => mockSend.mock.calls.map(([command]) => (command as { _type: string })._type);

describe('listUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
    mockPlayersList.mockResolvedValue([]);
  });
  afterEach(() => mockSend.mockReset());

  it('returns 403 if caller is not Admin', async () => {
    const result = await listUsers(withAuth(makeEvent(), 'Wrestler'), ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('returns formatted user list with groups for Admin', async () => {
    const created = new Date('2024-01-15T00:00:00Z');
    mockDirectory([{
      Username: 'john',
      Attributes: [
        { Name: 'sub', Value: 'sub-1' },
        { Name: 'email', Value: 'john@test.com' },
        { Name: 'name', Value: 'John Doe' },
        { Name: 'custom:wrestler_name', Value: 'The Rock' },
      ],
      UserStatus: 'CONFIRMED', Enabled: true, UserCreateDate: created,
    }], { Wrestler: ['john'] });

    const result = await listUsers(withAuth(makeEvent(), 'Admin'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const b = body(result);
    expect(b.users).toHaveLength(1);
    expect(b.users[0]).toMatchObject({
      username: 'john', sub: 'sub-1', email: 'john@test.com', name: 'John Doe',
      wrestlerName: 'The Rock', status: 'CONFIRMED', enabled: true,
      groups: ['Wrestler'],
    });
    expect(b.users[0].created).toBe(created.toISOString());
  });

  it('reads groups from each group member list, never one call per user', async () => {
    const users = Array.from({ length: 50 }, (_, index) => ({ Username: `user-${index}`, Enabled: true }));
    mockDirectory(users, { Admin: ['user-0'], Moderator: ['user-0', 'user-1'], Wrestler: ['user-0', 'user-2'] });

    const result = await listUsers(withAuth(makeEvent(), 'Admin'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const groupsOf = (username: string) =>
      body(result).users.find((user: { username: string }) => user.username === username).groups;
    expect(groupsOf('user-0')).toEqual(['Admin', 'Moderator', 'Wrestler']);
    expect(groupsOf('user-1')).toEqual(['Moderator']);
    expect(groupsOf('user-3')).toEqual([]);
    expect(sentTypes()).not.toContain('AdminListGroups');
    expect(sentTypes().filter((type) => type === 'ListUsersInGroup')).toHaveLength(3);
  });

  it('follows pagination for users and for group members', async () => {
    mockSend.mockImplementation(async (command: { _type: string; PaginationToken?: string; NextToken?: string }) => {
      switch (command._type) {
        case 'ListUsers':
          return command.PaginationToken
            ? { Users: [{ Username: 'b' }] }
            : { Users: [{ Username: 'a' }], PaginationToken: 'users-2' };
        case 'ListGroups':
          return { Groups: [{ GroupName: 'Wrestler' }] };
        case 'ListUsersInGroup':
          return command.NextToken
            ? { Users: [{ Username: 'b' }] }
            : { Users: [{ Username: 'a' }], NextToken: 'members-2' };
        default:
          throw new Error(`unexpected command ${command._type}`);
      }
    });

    const result = await listUsers(withAuth(makeEvent(), 'Admin'), ctx, cb);

    expect(body(result).users.map((user: { username: string; groups: string[] }) => [user.username, user.groups])).toEqual([
      ['a', ['Wrestler']],
      ['b', ['Wrestler']],
    ]);
  });

  it('does not read the Players table', async () => {
    mockDirectory([{ Username: 'john', Attributes: [{ Name: 'sub', Value: 'sub-1' }], Enabled: true }], {});
    const result = await listUsers(withAuth(makeEvent(), 'Admin'), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(body(result).users[0]).not.toHaveProperty('player');
    expect(mockPlayersList).not.toHaveBeenCalled();
  });

  it('returns 500 on Cognito error', async () => {
    mockSend.mockRejectedValue(new Error('Cognito down'));
    const result = await listUsers(withAuth(makeEvent(), 'Admin'), ctx, cb);
    expect(result!.statusCode).toBe(500);
    expect(body(result).message).toBe('Failed to list users');
  });

  it('returns 500 rather than users with missing roles when a group listing fails', async () => {
    mockDirectory([{ Username: 'jane', Enabled: true }], { Wrestler: ['jane'] });
    const directory = mockSend.getMockImplementation()!;
    mockSend.mockImplementation(async (command: { _type: string }) => {
      if (command._type === 'ListUsersInGroup') throw new Error('throttled');
      return directory(command);
    });

    const result = await listUsers(withAuth(makeEvent(), 'Admin'), ctx, cb);
    expect(result!.statusCode).toBe(500);
  });

});

// ─── toggleUserEnabled ──────────────────────────────────────────────

describe('toggleUserEnabled', () => {
  beforeEach(() => vi.clearAllMocks());

  const ev = (b: Record<string, unknown> | null, groups = 'Admin') =>
    withAuth(makeEvent({ body: b ? JSON.stringify(b) : null }), groups);

  it('returns 403 if caller is not Admin', async () => {
    const result = await toggleUserEnabled(ev({ username: 'u', enabled: true }, 'Wrestler'), ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('returns 400 when body is missing', async () => {
    const result = await toggleUserEnabled(ev(null), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('Request body is required');
  });

  it('returns 400 when username or enabled is missing', async () => {
    const result = await toggleUserEnabled(ev({ username: 'u' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('username and enabled (boolean) are required');
  });

  it('calls AdminEnableUserCommand when enabled=true', async () => {
    mockSend.mockResolvedValueOnce({});
    const result = await toggleUserEnabled(ev({ username: 'john', enabled: true }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(body(result).message).toBe('User john has been enabled');
    expect(body(result).enabled).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ _type: 'AdminEnable' }));
  });

  it('calls AdminDisableUserCommand when enabled=false', async () => {
    mockSend.mockResolvedValueOnce({});
    const result = await toggleUserEnabled(ev({ username: 'john', enabled: false }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(body(result).message).toBe('User john has been disabled');
    expect(body(result).enabled).toBe(false);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ _type: 'AdminDisable' }));
  });

  it('returns 500 on Cognito error', async () => {
    mockSend.mockRejectedValueOnce(new Error('Cognito failure'));
    const result = await toggleUserEnabled(ev({ username: 'john', enabled: true }), ctx, cb);
    expect(result!.statusCode).toBe(500);
    expect(body(result).message).toBe('Failed to update user status');
  });
});

// ─── updateUserRole ─────────────────────────────────────────────────

describe('updateUserRole', () => {
  beforeEach(() => vi.clearAllMocks());

  const ev = (b: Record<string, unknown> | null, groups = 'Admin') =>
    withAuth(makeEvent({ body: b ? JSON.stringify(b) : null }), groups);

  it('returns 403 if caller is not Admin', async () => {
    const result = await updateUserRole(ev({ username: 'u', role: 'Wrestler', action: 'promote' }, 'Wrestler'), ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('returns 400 when body is missing', async () => {
    const result = await updateUserRole(ev(null), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('Request body is required');
  });

  it('returns 400 when username, role, or action is missing', async () => {
    const result = await updateUserRole(ev({ username: 'u', role: 'Wrestler' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('username, role, and action are required');
  });

  it('returns 400 for invalid role', async () => {
    const result = await updateUserRole(ev({ username: 'u', role: 'SuperHero', action: 'promote' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toContain('Invalid role: SuperHero');
  });

  it('returns 400 for invalid action', async () => {
    const result = await updateUserRole(ev({ username: 'u', role: 'Wrestler', action: 'fire' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('action must be "promote" or "demote"');
  });

  it('returns 403 when Moderator tries to manage Admin role (fails requireRole check)', async () => {
    const result = await updateUserRole(ev({ username: 'u', role: 'Admin', action: 'promote' }, 'Moderator'), ctx, cb);
    expect(result!.statusCode).toBe(403);
    expect(body(result).message).toBe('You do not have permission to perform this action');
  });

  it('promotes user to a non-Wrestler role and returns updated groups', async () => {
    mockSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Groups: [{ GroupName: 'Moderator' }] });

    const result = await updateUserRole(ev({ username: 'jane', role: 'Moderator', action: 'promote' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(body(result).message).toBe('User jane added to Moderator group');
    expect(body(result).groups).toEqual(['Moderator']);
  });

  it('demotes user and returns updated groups', async () => {
    mockSend
      .mockResolvedValueOnce({})                                                   // remove from group
      .mockResolvedValueOnce({ UserAttributes: [{ Name: 'sub', Value: 'jane-sub' }] }) // AdminGetUser
      .mockResolvedValueOnce({ Groups: [] });
    mockPlayersFindByUserId.mockResolvedValueOnce({ playerId: 'jane-player' });

    const result = await updateUserRole(ev({ username: 'jane', role: 'Wrestler', action: 'demote' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(body(result).message).toBe('User jane removed from Wrestler group');
    expect(body(result).groups).toEqual([]);
    // Losing the role hides the player from standings and the dashboard.
    expect(mockPlayersUpdate).toHaveBeenCalledWith('jane-player', { hasWrestlerRole: false });
  });

  it('demoting from Wrestler still succeeds when the player lookup fails', async () => {
    mockSend
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('AdminGetUser failed'))
      .mockResolvedValueOnce({ Groups: [] });

    const result = await updateUserRole(ev({ username: 'jane', role: 'Wrestler', action: 'demote' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(body(result).groups).toEqual([]);
  });

  it('demoting a non-Wrestler role leaves the player flag alone', async () => {
    mockSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Groups: ['Wrestler'] });

    const result = await updateUserRole(ev({ username: 'jane', role: 'Moderator', action: 'demote' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(mockPlayersUpdate).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the sign-up attributes',
      [{ Name: 'custom:player_name', Value: 'Real Name' }, { Name: 'custom:psn_id', Value: 'PSN_1' }],
      { name: 'Real Name', psnId: 'PSN_1' },
    ],
    [
      'a neutral label, never the email, when nothing else is set',
      [{ Name: 'email', Value: 'person@example.com' }],
      { name: 'Player abcd1234' },
    ],
  ])('names a player created on promotion from %s', async (_label, attributes, expected) => {
    mockSend
      .mockResolvedValueOnce({}) // Add to Wrestler group
      .mockResolvedValueOnce({ UserAttributes: [{ Name: 'sub', Value: 'abcd1234-5678' }, ...attributes] })
      .mockResolvedValueOnce({ Groups: [{ GroupName: 'Wrestler' }] });
    mockPlayersFindByUserId.mockResolvedValueOnce(null);
    mockPlayersCreate.mockResolvedValueOnce({ playerId: 'test-uuid-1234' });
    mockPlayersUpdate.mockResolvedValueOnce({});

    await updateUserRole(ev({ username: 'steve', role: 'Wrestler', action: 'promote' }), ctx, cb);

    expect(mockPlayersCreate).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

  it('promotes to Wrestler and creates Player record', async () => {
    mockSend
      .mockResolvedValueOnce({}) // Add to Wrestler group
      .mockResolvedValueOnce({   // AdminGetUserCommand
        UserAttributes: [
          { Name: 'sub', Value: 'user-cognito-sub' },
          { Name: 'custom:wrestler_name', Value: 'Stone Cold' },
        ],
      })
      .mockResolvedValueOnce({ Groups: [{ GroupName: 'Wrestler' }] });
    mockPlayersFindByUserId.mockResolvedValueOnce(null);
    mockPlayersCreate.mockResolvedValueOnce({
      playerId: 'test-uuid-1234',
      name: '',
      currentWrestler: 'Stone Cold',
      wins: 0,
      losses: 0,
      draws: 0,
    });
    mockPlayersUpdate.mockResolvedValueOnce({});

    const result = await updateUserRole(ev({ username: 'steve', role: 'Wrestler', action: 'promote' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(mockPlayersCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Stone Cold',
      currentWrestler: 'Stone Cold',
    }));
    expect(mockPlayersUpdate).toHaveBeenCalledWith('test-uuid-1234', {
      userId: 'user-cognito-sub',
      hasWrestlerRole: true,
    });
  });

  it('promotes to Wrestler but skips Player creation if player exists', async () => {
    mockSend
      .mockResolvedValueOnce({}) // Wrestler group
      .mockResolvedValueOnce({ UserAttributes: [{ Name: 'sub', Value: 'existing-sub' }] })
      .mockResolvedValueOnce({ Groups: [{ GroupName: 'Wrestler' }] });
    mockPlayersFindByUserId.mockResolvedValueOnce({
      playerId: 'existing-player',
      hasWrestlerRole: false,
    });

    const result = await updateUserRole(ev({ username: 'steve', role: 'Wrestler', action: 'promote' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(mockPlayersCreate).not.toHaveBeenCalled();
    // Re-granting the role un-hides a previously demoted player.
    expect(mockPlayersUpdate).toHaveBeenCalledWith('existing-player', { hasWrestlerRole: true });
  });

  it('re-promoting an already-flagged player writes nothing', async () => {
    mockSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ UserAttributes: [{ Name: 'sub', Value: 'existing-sub' }] })
      .mockResolvedValueOnce({ Groups: [{ GroupName: 'Wrestler' }] });
    mockPlayersFindByUserId.mockResolvedValueOnce({
      playerId: 'existing-player',
      hasWrestlerRole: true,
    });

    const result = await updateUserRole(ev({ username: 'steve', role: 'Wrestler', action: 'promote' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(mockPlayersUpdate).not.toHaveBeenCalled();
  });

  it('promotes to Wrestler: player creation failure is non-blocking', async () => {
    mockSend
      .mockResolvedValueOnce({}) // Wrestler group
      .mockRejectedValueOnce(new Error('AdminGetUser failed'))
      .mockResolvedValueOnce({ Groups: [{ GroupName: 'Wrestler' }] });

    const result = await updateUserRole(ev({ username: 'steve', role: 'Wrestler', action: 'promote' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(body(result).message).toBe('User steve added to Wrestler group');
  });

  it('returns 500 on unexpected top-level error', async () => {
    mockSend.mockRejectedValueOnce(new Error('unexpected'));
    const result = await updateUserRole(ev({ username: 'u', role: 'Moderator', action: 'promote' }), ctx, cb);
    expect(result!.statusCode).toBe(500);
    expect(body(result).message).toBe('Failed to update user role');
  });
});
