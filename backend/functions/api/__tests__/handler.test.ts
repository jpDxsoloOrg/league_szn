import type { APIGatewayProxyEvent, APIGatewayProxyResult, Callback, Context } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler, normalizeOfflineEvent, UNMATCHED_ROUTE } from '../handler';

// A small table stands in for the merged one; routes.test.ts covers the real table.
vi.mock('../routes', async () => {
  const { getAuthContext, isSuperAdmin } = await import('../../../lib/auth');
  const { STAFF } = await import('../../../lib/router');
  const echoGroups = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => ({
    statusCode: 200,
    body: JSON.stringify({ groups: getAuthContext(event).groups, path: event.path }),
  });
  // Like users/updateUserRole: the handler checks full Admin itself.
  const superAdminOnly = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => (
    isSuperAdmin(getAuthContext(event))
      ? { statusCode: 200, body: JSON.stringify({ userId: event.pathParameters?.userId }) }
      : { statusCode: 403, body: '{}' }
  );
  const ok = async (): Promise<APIGatewayProxyResult> => ({ statusCode: 200, body: '{}' });
  return {
    allRoutes: [
      { resource: '/standings', method: 'GET', handler: ok, access: 'public' },
      { resource: '/players', method: 'POST', handler: echoGroups, access: STAFF },
      { resource: '/users/{userId}/role', method: 'PUT', handler: superAdminOnly, access: STAFF },
    ],
  };
});
vi.mock('../../../lib/accountStatus', () => ({
  isCallerDeactivated: async () => false,
}));

const context = {} as Context;
const callback = vi.fn() as Callback<APIGatewayProxyResult>;

function makeEvent(
  method: string,
  path: string,
  overrides: { resource?: string; authorizer?: Record<string, string>; headers?: Record<string, string> } = {},
): APIGatewayProxyEvent {
  return {
    httpMethod: method,
    path,
    resource: overrides.resource ?? '/{proxy+}',
    pathParameters: { proxy: path.slice(1) },
    queryStringParameters: null,
    headers: overrides.headers ?? {},
    body: null,
    requestContext: { authorizer: overrides.authorizer },
  } as unknown as APIGatewayProxyEvent;
}

/** What serverless-offline sends: the stage prefix and a fake principal with no groups. */
const offlineEvent = (method: string, path: string) => makeEvent(method, `/dev${path}`, {
  resource: '/dev/{proxy+}',
  authorizer: { principalId: 'offlineContext_authorizer_principalId' },
});

async function call(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return (await handler(event, context, callback)) as APIGatewayProxyResult;
}

describe('api handler', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env.IS_OFFLINE;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.IS_OFFLINE;
    logSpy.mockRestore();
  });

  const loggedLines = (): unknown[] => logSpy.mock.calls.map(([line]) => JSON.parse(String(line)));

  describe('normalizeOfflineEvent', () => {
    it('strips the /dev prefix and drops the fake authorizer offline', () => {
      process.env.IS_OFFLINE = 'true';
      const event = normalizeOfflineEvent(offlineEvent('GET', '/players/me'));
      expect(event.path).toBe('/players/me');
      expect(event.resource).toBe('/{proxy+}');
      expect(event.requestContext.authorizer).toBeUndefined();
    });

    it('leaves paths without the prefix alone', () => {
      process.env.IS_OFFLINE = 'true';
      expect(normalizeOfflineEvent(makeEvent('GET', '/devices')).path).toBe('/devices');
    });

    it('changes nothing when not offline', () => {
      const event = normalizeOfflineEvent(offlineEvent('GET', '/players/me'));
      expect(event.path).toBe('/dev/players/me');
      expect(event.resource).toBe('/dev/{proxy+}');
      expect(event.requestContext.authorizer).toEqual({ principalId: 'offlineContext_authorizer_principalId' });
    });
  });

  describe('offline-shaped events', () => {
    beforeEach(() => {
      process.env.IS_OFFLINE = 'true';
    });

    it('reaches a staff route as the offline Admin', async () => {
      const result = await call(offlineEvent('POST', '/players'));
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({ groups: ['Admin'], path: '/players' });
    });

    it('passes a handler that checks for full Admin itself', async () => {
      const result = await call(offlineEvent('PUT', '/users/u-1/role'));
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({ userId: 'u-1' });
    });
  });

  it('gives the same event no Admin context when not offline', async () => {
    const result = await call(offlineEvent('PUT', '/users/u-1/role'));
    expect(result.statusCode).not.toBe(200);
    const staff = await call(makeEvent('POST', '/players', {
      authorizer: { principalId: 'offlineContext_authorizer_principalId' },
    }));
    // A principal with no groups fails the staff check instead of becoming Admin.
    expect(staff.statusCode).toBe(403);
  });

  it('serves POST /auth/setup before the router, through createAdminUser', async () => {
    const result = await call(makeEvent('POST', '/auth/setup'));
    // createAdminUser's own refusal, not the router's 404.
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message ?? result.body).toContain('setup key');
    expect(loggedLines()).toEqual([{ route: 'POST /auth/setup', status: 401, ms: expect.any(Number) }]);
  });

  it('answers 404 for an unknown path and logs it as unmatched, without the path', async () => {
    const result = await call(makeEvent('GET', '/wp-admin/setup.php'));
    expect(result.statusCode).toBe(404);
    expect(loggedLines()).toEqual([{ route: UNMATCHED_ROUTE, method: 'GET', status: 404, ms: expect.any(Number) }]);
    expect(String(logSpy.mock.calls[0][0])).not.toContain('wp-admin');
  });

  it('answers 405 for a method the path does not declare', async () => {
    const result = await call(makeEvent('DELETE', '/standings'));
    expect(result.statusCode).toBe(405);
    expect(loggedLines()).toEqual([{ route: UNMATCHED_ROUTE, method: 'DELETE', status: 405, ms: expect.any(Number) }]);
  });

  it('answers 401 with CORS headers for a protected route without a token', async () => {
    const result = await call(makeEvent('POST', '/players'));
    expect(result.statusCode).toBe(401);
    expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined();
  });

  it('logs the route template, status and duration for a matched request', async () => {
    const result = await call(makeEvent('GET', '/standings'));
    expect(result.statusCode).toBe(200);
    expect(loggedLines()).toEqual([{ route: 'GET /standings', status: 200, ms: expect.any(Number) }]);
  });

  it('logs the template, not the concrete path, for a parameterised route', async () => {
    process.env.IS_OFFLINE = 'true';
    await call(offlineEvent('PUT', '/users/u-1/role'));
    expect(loggedLines()).toEqual([{ route: 'PUT /users/{userId}/role', status: 200, ms: expect.any(Number) }]);
  });
});
