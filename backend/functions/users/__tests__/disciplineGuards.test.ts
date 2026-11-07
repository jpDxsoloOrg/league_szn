import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Callback, Context } from 'aws-lambda';

const { mockSend, mockFindPlayer } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockFindPlayer: vi.fn(),
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: mockSend })),
  AdminEnableUserCommand: vi.fn((input: unknown) => ({ kind: 'enable', input })),
  AdminDisableUserCommand: vi.fn((input: unknown) => ({ kind: 'disable', input })),
  AdminGetUserCommand: vi.fn((input: unknown) => ({ kind: 'get', input })),
  AdminDeleteUserCommand: vi.fn((input: unknown) => ({ kind: 'delete', input })),
}));
vi.mock('../../../lib/disciplineActions', () => ({
  findPlayerForCognitoUsername: mockFindPlayer,
}));

import { handler as toggleUserEnabled } from '../toggleUserEnabled';
import { handler as deleteUser } from '../deleteUser';

const DAY_MS = 24 * 60 * 60 * 1000;
const ctx = {} as Context;
const cb = (() => {}) as Callback<APIGatewayProxyResult>;

const strike = (daysAgo: number) => ({
  strikeId: `strike-${daysAgo}`,
  issuedAt: new Date(Date.now() - daysAgo * DAY_MS).toISOString(),
  issuedBy: 'admin',
  issuedByName: 'Admin',
  reason: 'Missed the show',
});

const adminEvent = (body: Record<string, unknown>): APIGatewayProxyEvent => ({
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
    authorizer: { groups: 'Admin', username: 'admin', email: '', principalId: 'admin-sub' },
  } as unknown as APIGatewayProxyEvent['requestContext'],
});

const codeOf = (result: APIGatewayProxyResult) => (JSON.parse(result.body) as { code?: string }).code;

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockResolvedValue({ Enabled: false });
  mockFindPlayer.mockResolvedValue(null);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('toggleUserEnabled', () => {
  const toggle = async (enabled: boolean) =>
    (await toggleUserEnabled(adminEvent({ username: 'john', enabled }), ctx, cb)) as APIGatewayProxyResult;

  it('refuses enabling a deactivated player, with no Cognito call', async () => {
    mockFindPlayer.mockResolvedValue({ playerId: 'p1', deactivatedAt: '2026-01-01T00:00:00.000Z' });
    const result = await toggle(true);
    expect(result.statusCode).toBe(409);
    expect(codeOf(result)).toBe('PLAYER_DEACTIVATED');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('gives 500 on a lookup error, with no Cognito call', async () => {
    mockFindPlayer.mockRejectedValue(new Error('cognito down'));
    const result = await toggle(true);
    expect(result.statusCode).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('enables a clear player, a struck player and an unlinked user', async () => {
    mockFindPlayer.mockResolvedValueOnce({ playerId: 'p1' });
    expect((await toggle(true)).statusCode).toBe(200);
    mockFindPlayer.mockResolvedValueOnce({ playerId: 'p1', strikes: [strike(3), strike(1)] });
    expect((await toggle(true)).statusCode).toBe(200);
    mockFindPlayer.mockResolvedValueOnce(null);
    expect((await toggle(true)).statusCode).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it('always allows disabling, with no lookup', async () => {
    expect((await toggle(false)).statusCode).toBe(200);
    expect(mockFindPlayer).not.toHaveBeenCalled();
  });
});

describe('deleteUser', () => {
  const remove = async () =>
    (await deleteUser(adminEvent({ username: 'john' }), ctx, cb)) as APIGatewayProxyResult;

  it.each([
    ['warned', [1]],
    ['signup-blocked', [3, 1]],
    ['cooldown', [10, 8]],
  ])('refuses while %s, with no Cognito call', async (_status, daysAgo) => {
    mockFindPlayer.mockResolvedValue({ playerId: 'p1', strikes: daysAgo.map(strike) });
    const result = await remove();
    expect(result.statusCode).toBe(409);
    expect(codeOf(result)).toBe('DISCIPLINE_ACTIVE');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('refuses while deactivated, with no Cognito call', async () => {
    mockFindPlayer.mockResolvedValue({ playerId: 'p1', deactivatedAt: '2026-01-01T00:00:00.000Z' });
    const result = await remove();
    expect(result.statusCode).toBe(409);
    expect(codeOf(result)).toBe('PLAYER_DEACTIVATED');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('gives 500 on a lookup error, with no Cognito call', async () => {
    mockFindPlayer.mockRejectedValue(new Error('cognito down'));
    expect((await remove()).statusCode).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('deletes once the player is clear', async () => {
    mockFindPlayer.mockResolvedValue({ playerId: 'p1', strikes: [strike(8)] });
    expect((await remove()).statusCode).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('deletes an unlinked user', async () => {
    expect((await remove()).statusCode).toBe(200);
  });
});
