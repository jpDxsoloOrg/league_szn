import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Callback, Context } from 'aws-lambda';

const { mockSend, mockFindPlayer, mockFindByUserId, mockPlayersCreate, mockPlayersUpdate } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockFindPlayer: vi.fn(),
  mockFindByUserId: vi.fn(),
  mockPlayersCreate: vi.fn(),
  mockPlayersUpdate: vi.fn(),
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: mockSend })),
  AdminEnableUserCommand: vi.fn((input: { Username: string }) => ({ kind: 'enable', ...input })),
  AdminDisableUserCommand: vi.fn((input: { Username: string }) => ({ kind: 'disable', ...input })),
  AdminGetUserCommand: vi.fn((input: { Username: string }) => ({ kind: 'get', ...input })),
  AdminDeleteUserCommand: vi.fn((input: { Username: string }) => ({ kind: 'delete', ...input })),
  AdminAddUserToGroupCommand: vi.fn((input: { Username: string }) => ({ kind: 'addGroup', ...input })),
  AdminRemoveUserFromGroupCommand: vi.fn((input: { Username: string }) => ({ kind: 'removeGroup', ...input })),
}));
vi.mock('../../../lib/disciplineActions', () => ({
  findPlayerForCognitoUsername: mockFindPlayer,
}));
vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    roster: {
      players: { findByUserId: mockFindByUserId, create: mockPlayersCreate, update: mockPlayersUpdate },
    },
  }),
}));

import { handler as bulkUsers, MAX_BULK_USERS } from '../bulkUsers';

const ctx = {} as Context;
const cb = (() => {}) as Callback<APIGatewayProxyResult>;

function event(body: Record<string, unknown>, groups = 'Admin'): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      authorizer: { groups, username: 'me', email: '', principalId: 'me-sub' },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

async function run(body: Record<string, unknown>, groups?: string) {
  const result = (await bulkUsers(event(body, groups), ctx, cb)) as APIGatewayProxyResult;
  return { status: result.statusCode, body: JSON.parse(result.body) };
}

type Command = { kind: string; Username?: string; GroupName?: string };
const sent = () => mockSend.mock.calls.map(([command]) => command as Command);

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockResolvedValue({ Enabled: false, UserAttributes: [{ Name: 'sub', Value: 'sub-x' }] });
  mockFindPlayer.mockResolvedValue(null);
  mockFindByUserId.mockResolvedValue(null);
  mockPlayersCreate.mockResolvedValue({ playerId: 'new-player' });
  mockPlayersUpdate.mockResolvedValue({});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('bulkUsers validation', () => {
  it('is Admin only', async () => {
    expect((await run({ action: 'disable', usernames: ['a'] }, 'Moderator')).status).toBe(403);
  });

  it.each([
    [{ action: 'explode', usernames: ['a'] }],
    [{ action: 'disable', usernames: [] }],
    [{ action: 'disable', usernames: 'a' }],
    [{ action: 'disable', usernames: ['a', ''] }],
    [{ action: 'addRole', usernames: ['a'] }],
    [{ action: 'addRole', role: 'Admin', usernames: ['a'] }],
  ])('rejects %j', async (body) => {
    expect((await run(body)).status).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it(`caps a request at ${MAX_BULK_USERS} users`, async () => {
    const usernames = Array.from({ length: MAX_BULK_USERS + 1 }, (_, index) => `user-${index}`);
    expect((await run({ action: 'disable', usernames })).status).toBe(400);
  });
});

describe('bulkUsers actions', () => {
  it('disables every account once, ignoring duplicates', async () => {
    const { status, body } = await run({ action: 'disable', usernames: ['a', 'b', 'a'] });
    expect(status).toBe(200);
    expect(body).toMatchObject({ succeeded: 2, failed: 0 });
    expect(sent().map((command) => [command.kind, command.Username])).toEqual([['disable', 'a'], ['disable', 'b']]);
  });

  it('never disables, deletes or strips a role from the caller, by username or sub', async () => {
    for (const action of [{ action: 'disable' }, { action: 'delete' }, { action: 'removeRole', role: 'Moderator' }]) {
      mockSend.mockClear();
      const { body } = await run({ ...action, usernames: ['me', 'me-sub'] });
      expect(body.results.map((result: { code: string }) => result.code)).toEqual(['SELF', 'SELF']);
      expect(mockSend).not.toHaveBeenCalled();
    }
  });

  it('lets the caller enable or add a role to their own account', async () => {
    const { body } = await run({ action: 'addRole', role: 'Wrestler', usernames: ['me'] });
    expect(body).toMatchObject({ succeeded: 1 });
  });

  it('keeps going past a refusal and reports each account', async () => {
    mockFindPlayer.mockImplementation(async (username: string) =>
      username === 'benched' ? { playerId: 'p1', deactivatedAt: '2026-01-01T00:00:00.000Z' } : null);

    const { body } = await run({ action: 'enable', usernames: ['ok-1', 'benched', 'ok-2'] });

    expect(body).toMatchObject({ succeeded: 2, failed: 1 });
    expect(body.results[1]).toMatchObject({ username: 'benched', ok: false, code: 'PLAYER_DEACTIVATED' });
    expect(sent().filter((command) => command.kind === 'enable').map((command) => command.Username)).toEqual(['ok-1', 'ok-2']);
  });

  it('refuses to delete an account that is still enabled', async () => {
    mockSend.mockImplementation(async (command: Command) => (command.kind === 'get' ? { Enabled: command.Username === 'live' } : {}));

    const { body } = await run({ action: 'delete', usernames: ['live', 'gone'] });

    expect(body.results).toEqual([
      expect.objectContaining({ username: 'live', ok: false, code: 'USER_ENABLED' }),
      { username: 'gone', ok: true },
    ]);
    expect(sent().filter((command) => command.kind === 'delete').map((command) => command.Username)).toEqual(['gone']);
  });

  it('reports an unexpected Cognito error for that account only', async () => {
    mockSend.mockImplementation(async (command: Command) => {
      if (command.Username === 'flaky') throw new Error('throttled');
      return {};
    });

    const { status, body } = await run({ action: 'disable', usernames: ['flaky', 'fine'] });

    expect(status).toBe(200);
    expect(body.results).toEqual([
      expect.objectContaining({ username: 'flaky', ok: false, code: 'ERROR' }),
      { username: 'fine', ok: true },
    ]);
  });

  it('adds the Wrestler role and creates the missing player, like the single-user route', async () => {
    const { body } = await run({ action: 'addRole', role: 'Wrestler', usernames: ['newbie'] });

    expect(body).toMatchObject({ succeeded: 1, role: 'Wrestler' });
    expect(sent()[0]).toMatchObject({ kind: 'addGroup', Username: 'newbie', GroupName: 'Wrestler' });
    expect(mockPlayersCreate).toHaveBeenCalled();
    expect(mockPlayersUpdate).toHaveBeenCalledWith('new-player', { userId: 'sub-x', hasWrestlerRole: true });
  });

  it('removes the Moderator role without touching players', async () => {
    const { body } = await run({ action: 'removeRole', role: 'Moderator', usernames: ['mod'] });

    expect(body).toMatchObject({ succeeded: 1 });
    expect(sent()).toEqual([expect.objectContaining({ kind: 'removeGroup', Username: 'mod', GroupName: 'Moderator' })]);
    expect(mockFindByUserId).not.toHaveBeenCalled();
  });
});
