import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Hoisted mocks ──────────────────────────────────────────────────

const { mockSend, mockPlayersFindByUserId, mockPlayersCreate, mockPlayersUpdate } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockPlayersFindByUserId: vi.fn(),
  mockPlayersCreate: vi.fn(),
  mockPlayersUpdate: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    roster: {
      players: {
        findByUserId: mockPlayersFindByUserId,
        create: mockPlayersCreate,
        update: mockPlayersUpdate,
      },
    },
  }),
}));

vi.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: mockSend })),
  ListUsersCommand: vi.fn((p: Record<string, unknown>) => ({ _type: 'ListUsers', ...p })),
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

describe('listUsers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 if caller is not Admin', async () => {
    const result = await listUsers(withAuth(makeEvent(), 'Wrestler'), ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('returns formatted user list with groups for Admin', async () => {
    const created = new Date('2024-01-15T00:00:00Z');
    mockSend
      .mockResolvedValueOnce({
        Users: [{
          Username: 'john',
          Attributes: [
            { Name: 'sub', Value: 'sub-1' },
            { Name: 'email', Value: 'john@test.com' },
            { Name: 'name', Value: 'John Doe' },
            { Name: 'custom:wrestler_name', Value: 'The Rock' },
          ],
          UserStatus: 'CONFIRMED', Enabled: true, UserCreateDate: created,
        }],
      })
      .mockResolvedValueOnce({ Groups: [{ GroupName: 'Wrestler' }, { GroupName: 'Fantasy' }] });

    const result = await listUsers(withAuth(makeEvent(), 'Admin'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const b = body(result);
    expect(b.users).toHaveLength(1);
    expect(b.users[0]).toMatchObject({
      username: 'john', sub: 'sub-1', email: 'john@test.com', name: 'John Doe',
      wrestlerName: 'The Rock', status: 'CONFIRMED', enabled: true,
      groups: ['Wrestler', 'Fantasy'],
    });
    expect(b.users[0].created).toBe(created.toISOString());
  });

  it('returns 500 on Cognito error', async () => {
    mockSend.mockRejectedValueOnce(new Error('Cognito down'));
    const result = await listUsers(withAuth(makeEvent(), 'Admin'), ctx, cb);
    expect(result!.statusCode).toBe(500);
    expect(body(result).message).toBe('Failed to list users');
  });

  it('handles group fetch failure per user gracefully', async () => {
    mockSend
      .mockResolvedValueOnce({ Users: [{ Username: 'jane', Attributes: [], Enabled: true }] })
      .mockRejectedValueOnce(new Error('group fetch failed'));

    const result = await listUsers(withAuth(makeEvent(), 'Admin'), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(body(result).users[0].groups).toEqual([]);
  });
});

// ─── toggleUserEnabled ──────────────────────────────────────────────

describe('toggleUserEnabled', () => {
  beforeEach(() => vi.clearAllMocks());

  const ev = (b: Record<string, unknown> | null, groups = 'Admin') =>
    withAuth(makeEvent({ body: b ? JSON.stringify(b) : null }), groups);

  it('returns 403 if caller is not Admin', async () => {
    const result = await toggleUserEnabled(ev({ username: 'u', enabled: true }, 'Fantasy'), ctx, cb);
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
    const result = await updateUserRole(ev({ username: 'u', role: 'Wrestler', action: 'promote' }, 'Fantasy'), ctx, cb);
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
      .mockResolvedValueOnce({ Groups: [{ GroupName: 'Fantasy' }] });

    const result = await updateUserRole(ev({ username: 'jane', role: 'Fantasy', action: 'promote' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(body(result).message).toBe('User jane added to Fantasy group');
    expect(body(result).groups).toEqual(['Fantasy']);
  });

  it('demotes user and returns updated groups', async () => {
    mockSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Groups: [] });

    const result = await updateUserRole(ev({ username: 'jane', role: 'Wrestler', action: 'demote' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(body(result).message).toBe('User jane removed from Wrestler group');
    expect(body(result).groups).toEqual([]);
  });

  it('promotes to Wrestler: auto-adds Fantasy and creates Player record', async () => {
    mockSend
      .mockResolvedValueOnce({}) // Add to Wrestler group
      .mockResolvedValueOnce({}) // Add to Fantasy group
      .mockResolvedValueOnce({   // AdminGetUserCommand
        UserAttributes: [
          { Name: 'sub', Value: 'user-cognito-sub' },
          { Name: 'custom:wrestler_name', Value: 'Stone Cold' },
        ],
      })
      .mockResolvedValueOnce({ Groups: [{ GroupName: 'Wrestler' }, { GroupName: 'Fantasy' }] });
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
      name: '',
      currentWrestler: 'Stone Cold',
    }));
    expect(mockPlayersUpdate).toHaveBeenCalledWith('test-uuid-1234', { userId: 'user-cognito-sub' });
  });

  it('promotes to Wrestler but skips Player creation if player exists', async () => {
    mockSend
      .mockResolvedValueOnce({}) // Wrestler group
      .mockResolvedValueOnce({}) // Fantasy group
      .mockResolvedValueOnce({ UserAttributes: [{ Name: 'sub', Value: 'existing-sub' }] })
      .mockResolvedValueOnce({ Groups: [{ GroupName: 'Wrestler' }] });
    mockPlayersFindByUserId.mockResolvedValueOnce({ playerId: 'existing-player' });

    const result = await updateUserRole(ev({ username: 'steve', role: 'Wrestler', action: 'promote' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(mockPlayersCreate).not.toHaveBeenCalled();
  });

  it('promotes to Wrestler: player creation failure is non-blocking', async () => {
    mockSend
      .mockResolvedValueOnce({}) // Wrestler group
      .mockResolvedValueOnce({}) // Fantasy group
      .mockRejectedValueOnce(new Error('AdminGetUser failed'))
      .mockResolvedValueOnce({ Groups: [{ GroupName: 'Wrestler' }] });

    const result = await updateUserRole(ev({ username: 'steve', role: 'Wrestler', action: 'promote' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(body(result).message).toBe('User steve added to Wrestler group');
  });

  it('returns 500 on unexpected top-level error', async () => {
    mockSend.mockRejectedValueOnce(new Error('unexpected'));
    const result = await updateUserRole(ev({ username: 'u', role: 'Fantasy', action: 'promote' }), ctx, cb);
    expect(result!.statusCode).toBe(500);
    expect(body(result).message).toBe('Failed to update user role');
  });
});
