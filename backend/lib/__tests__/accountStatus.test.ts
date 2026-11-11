import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Callback, Context } from 'aws-lambda';

const { mockQueryAll, mockScanAll, mockVerify } = vi.hoisted(() => ({
  mockQueryAll: vi.fn(),
  mockScanAll: vi.fn(),
  mockVerify: vi.fn(),
}));

vi.mock('../dynamodb', () => ({
  dynamoDb: { queryAll: mockQueryAll, scanAll: mockScanAll },
  TableNames: { PLAYERS: 'Players' },
}));
vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: () => ({ verify: mockVerify }) },
}));

import {
  ACCOUNT_CHECK_TIMEOUT_MS,
  isAccountDeactivated,
  isCallerDeactivated,
  isSignupRefused,
} from '../accountStatus';
import { authenticate } from '../authenticate';
import { getVerifiedCaller } from '../optionalCaller';
import { createRouter, type RouteConfig } from '../router';
import { handler as generateUploadUrl } from '../../functions/images/generateUploadUrl';

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

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/things',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/things',
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

const withToken = () => makeEvent({ headers: { Authorization: 'Bearer good-token' } });

const gatewayEvent = () => makeEvent({
  requestContext: {
    authorizer: { principalId: 'sub-1', groups: 'Wrestler', username: 'u', email: '' },
  } as unknown as APIGatewayProxyEvent['requestContext'],
});

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryAll.mockResolvedValue([]);
  mockScanAll.mockResolvedValue([]);
  mockVerify.mockResolvedValue({ sub: 'sub-1', username: 'u', 'cognito:groups': ['Wrestler'] });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('isAccountDeactivated', () => {
  it('reads the row through UserIdIndex', async () => {
    mockQueryAll.mockResolvedValue([{ deactivatedAt: '2026-01-01T00:00:00.000Z' }]);
    expect(await isAccountDeactivated('sub-1')).toBe(true);
    expect(mockQueryAll).toHaveBeenCalledWith(expect.objectContaining({
      TableName: 'Players',
      IndexName: 'UserIdIndex',
      ExpressionAttributeValues: { ':userId': 'sub-1' },
    }));
  });

  it('is false for a clear row and for no row', async () => {
    mockQueryAll.mockResolvedValueOnce([{}]);
    expect(await isAccountDeactivated('sub-1')).toBe(false);
    mockQueryAll.mockResolvedValueOnce([]);
    expect(await isAccountDeactivated('sub-1')).toBe(false);
  });

  it('counts a second row for the same sub', async () => {
    mockQueryAll.mockResolvedValue([{}, { deactivatedAt: '2026-01-01T00:00:00.000Z' }]);
    expect(await isAccountDeactivated('sub-1')).toBe(true);
  });

  it('ignores a soft-deleted row', async () => {
    mockQueryAll.mockResolvedValue([{ deactivatedAt: '2026-01-01T00:00:00.000Z', deletedAt: '2026-02-01T00:00:00.000Z' }]);
    expect(await isAccountDeactivated('sub-1')).toBe(false);
  });

  it('fails open on a lookup error', async () => {
    mockQueryAll.mockRejectedValue(new Error('throttled'));
    expect(await isAccountDeactivated('sub-1')).toBe(false);
  });

  it('fails open at the timeout when the lookup never resolves', async () => {
    vi.useFakeTimers();
    mockQueryAll.mockReturnValue(new Promise(() => {}));
    const pending = isAccountDeactivated('sub-1');
    await vi.advanceTimersByTimeAsync(ACCOUNT_CHECK_TIMEOUT_MS);
    expect(await pending).toBe(false);
  });
});

describe('isCallerDeactivated', () => {
  it('pays for one query per event', async () => {
    const event = makeEvent();
    await isCallerDeactivated(event, 'sub-1');
    await isCallerDeactivated(event, 'sub-1');
    expect(mockQueryAll).toHaveBeenCalledOnce();

    await isCallerDeactivated(makeEvent(), 'sub-1');
    expect(mockQueryAll).toHaveBeenCalledTimes(2);
  });
});

describe('isSignupRefused', () => {
  const blocked = { playerId: 'p1', strikes: [strike(3), strike(1)], signupGuardKey: 'blocked@gmail.com', psnId: ' Blocked_PSN ' };

  it.each([
    ['the same email', { email: 'blocked@gmail.com' }],
    ['a case-changed email', { email: 'BLOCKED@Gmail.com' }],
    ['a +tag variant', { email: 'blocked+new@gmail.com' }],
    ['a dotted Gmail variant', { email: 'b.locked@gmail.com' }],
    ['the same PSN ID, ignoring case and spaces', { psnId: 'blocked_psn' }],
  ])('refuses %s while blocked', async (_label, input) => {
    mockScanAll.mockResolvedValue([blocked]);
    expect(await isSignupRefused(input)).toBe(true);
  });

  it('refuses a match on a deactivated row', async () => {
    mockScanAll.mockResolvedValue([{ ...blocked, strikes: [strike(100)], deactivatedAt: '2026-01-01T00:00:00.000Z' }]);
    expect(await isSignupRefused({ email: 'blocked@gmail.com' })).toBe(true);
  });

  it('allows a match once the block has ended', async () => {
    mockScanAll.mockResolvedValue([{ ...blocked, strikes: [strike(10), strike(8)] }]);
    expect(await isSignupRefused({ email: 'blocked@gmail.com', psnId: 'blocked_psn' })).toBe(false);
  });

  it('allows someone who matches nothing', async () => {
    mockScanAll.mockResolvedValue([blocked]);
    expect(await isSignupRefused({ email: 'new@example.com', psnId: 'new_psn' })).toBe(false);
  });

  it('skips the excluded player', async () => {
    mockScanAll.mockResolvedValue([blocked]);
    expect(await isSignupRefused({ psnId: 'blocked_psn', excludePlayerId: 'p1' })).toBe(false);
  });

  it('sends no scan with nothing to match', async () => {
    expect(await isSignupRefused({})).toBe(false);
    expect(mockScanAll).not.toHaveBeenCalled();
  });

  it('fails open on a lookup error', async () => {
    mockScanAll.mockRejectedValue(new Error('throttled'));
    expect(await isSignupRefused({ email: 'blocked@gmail.com' })).toBe(false);
  });

  it('fails open at the timeout when the lookup never resolves', async () => {
    vi.useFakeTimers();
    mockScanAll.mockReturnValue(new Promise(() => {}));
    const pending = isSignupRefused({ email: 'blocked@gmail.com' });
    await vi.advanceTimersByTimeAsync(ACCOUNT_CHECK_TIMEOUT_MS);
    expect(await pending).toBe(false);
  });
});

describe('authenticate', () => {
  it('passes a clear account and fills the context', async () => {
    const event = withToken();
    expect(await authenticate(event)).toEqual({ ok: true });
    expect(event.requestContext.authorizer?.principalId).toBe('sub-1');
  });

  it('refuses a valid token on a deactivated account and leaves the context empty', async () => {
    mockQueryAll.mockResolvedValue([{ deactivatedAt: '2026-01-01T00:00:00.000Z' }]);
    const event = withToken();
    expect(await authenticate(event)).toEqual({ ok: false });
    expect(event.requestContext.authorizer).toBeUndefined();
  });

  it('gives getVerifiedCaller the anonymous view', async () => {
    mockQueryAll.mockResolvedValue([{ deactivatedAt: '2026-01-01T00:00:00.000Z' }]);
    expect(await getVerifiedCaller(withToken())).toBeNull();
  });

  it('fails open when the lookup errors', async () => {
    mockQueryAll.mockRejectedValue(new Error('throttled'));
    expect(await authenticate(withToken())).toEqual({ ok: true });
  });

  it('fails open at the timeout', async () => {
    vi.useFakeTimers();
    mockQueryAll.mockReturnValue(new Promise(() => {}));
    const pending = authenticate(withToken());
    await vi.advanceTimersByTimeAsync(ACCOUNT_CHECK_TIMEOUT_MS);
    expect(await pending).toEqual({ ok: true });
  });

  it('makes no lookup offline', async () => {
    vi.stubEnv('IS_OFFLINE', 'true');
    expect(await authenticate(makeEvent())).toEqual({ ok: true });
    expect(mockQueryAll).not.toHaveBeenCalled();
  });
});

describe('dispatch', () => {
  const routeHandler = vi.fn();
  const router = createRouter([{
    method: 'GET',
    resource: '/things',
    handler: routeHandler as RouteConfig['handler'],
    access: 'self-service',
  }]);
  const run = async (event: APIGatewayProxyEvent) => (await router(event, ctx, cb)) as APIGatewayProxyResult;

  beforeEach(() => routeHandler.mockResolvedValue({ statusCode: 200, body: '{}' }));

  it('gives 401 to a deactivated caller who verified in the router', async () => {
    mockQueryAll.mockResolvedValue([{ deactivatedAt: '2026-01-01T00:00:00.000Z' }]);
    expect((await run(withToken())).statusCode).toBe(401);
    expect(routeHandler).not.toHaveBeenCalled();
  });

  it('gives 401 when a gateway authorizer already set principalId', async () => {
    mockQueryAll.mockResolvedValue([{ deactivatedAt: '2026-01-01T00:00:00.000Z' }]);
    expect((await run(gatewayEvent())).statusCode).toBe(401);
    expect(routeHandler).not.toHaveBeenCalled();
  });

  it('lets a clear gateway caller through with one query', async () => {
    expect((await run(gatewayEvent())).statusCode).toBe(200);
    expect(mockQueryAll).toHaveBeenCalledOnce();
  });

  it('pays for one query when a handler verifies the caller again', async () => {
    routeHandler.mockImplementation(async (event: APIGatewayProxyEvent) => {
      await authenticate(event);
      return { statusCode: 200, body: '{}' };
    });
    await run(withToken());
    expect(mockQueryAll).toHaveBeenCalledOnce();
  });

  it('fails open on a lookup error', async () => {
    mockQueryAll.mockRejectedValue(new Error('throttled'));
    expect((await run(gatewayEvent())).statusCode).toBe(200);
  });

  it('fails open at the timeout', async () => {
    vi.useFakeTimers();
    mockQueryAll.mockReturnValue(new Promise(() => {}));
    const pending = run(gatewayEvent());
    await vi.advanceTimersByTimeAsync(ACCOUNT_CHECK_TIMEOUT_MS);
    expect((await pending).statusCode).toBe(200);
  });

  it('makes no lookup offline', async () => {
    vi.stubEnv('IS_OFFLINE', 'true');
    expect((await run(gatewayEvent())).statusCode).toBe(200);
    expect(mockQueryAll).not.toHaveBeenCalled();
  });

  it('makes no lookup on a public route without a token', async () => {
    const publicRouter = createRouter([{
      method: 'GET',
      resource: '/things',
      handler: routeHandler as RouteConfig['handler'],
      access: 'public',
    }]);
    await publicRouter(makeEvent(), ctx, cb);
    expect(mockQueryAll).not.toHaveBeenCalled();
  });
});

describe('generateUploadUrl', () => {
  it('gives 401 to a deactivated caller', async () => {
    mockQueryAll.mockResolvedValue([{ deactivatedAt: '2026-01-01T00:00:00.000Z' }]);
    const result = await generateUploadUrl(gatewayEvent(), ctx, cb) as APIGatewayProxyResult;
    expect(result.statusCode).toBe(401);
  });

  it('does not stop a clear caller at this check', async () => {
    const result = await generateUploadUrl(gatewayEvent(), ctx, cb) as APIGatewayProxyResult;
    expect(result.statusCode).toBe(400);
  });
});
