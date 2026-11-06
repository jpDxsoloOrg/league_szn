import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context, Callback } from 'aws-lambda';
import { createRouter, ADMIN_ONLY, STAFF, type RouteConfig } from '../router';

const ctx = {} as Context;
const cb = (() => {}) as Callback<APIGatewayProxyResult>;

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/events',
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

describe('createRouter', () => {
  it('routes to the matching handler by method + resource', async () => {
    const getHandler = vi.fn().mockResolvedValue({ statusCode: 200, body: '{"ok":true}' });
    const routes: ReadonlyArray<RouteConfig> = [
      { method: 'GET', resource: '/events', handler: getHandler as RouteConfig['handler'], access: 'public' },
    ];
    const handler = createRouter(routes);

    const result = await handler(makeEvent({ httpMethod: 'GET', resource: '/events' }), ctx, cb);

    expect(result?.statusCode).toBe(200);
    expect(getHandler).toHaveBeenCalledTimes(1);
  });

  it('returns 405 when route does not match', async () => {
    const routes: ReadonlyArray<RouteConfig> = [
      { method: 'GET', resource: '/events', handler: vi.fn() as RouteConfig['handler'], access: 'public' },
    ];
    const handler = createRouter(routes);

    const result = await handler(makeEvent({ httpMethod: 'DELETE', resource: '/events/{eventId}' }), ctx, cb);

    expect(result?.statusCode).toBe(405);
  });

  it('normalizes lowercase request methods', async () => {
    const postHandler = vi.fn().mockResolvedValue({ statusCode: 201, body: '{"created":true}' });
    const routes: ReadonlyArray<RouteConfig> = [
      { method: 'POST', resource: '/events', handler: postHandler as RouteConfig['handler'], access: STAFF },
    ];
    const handler = createRouter(routes);

    const requestContext = {
      authorizer: { principalId: 'admin-sub', groups: 'Admin' },
    } as unknown as APIGatewayProxyEvent['requestContext'];
    const result = await handler(makeEvent({ httpMethod: 'post', resource: '/events', requestContext }), ctx, cb);

    expect(result?.statusCode).toBe(201);
    expect(postHandler).toHaveBeenCalledTimes(1);
  });

  it('matches by event.resource and ignores concrete event.path', async () => {
    const getByTemplateHandler = vi.fn().mockResolvedValue({ statusCode: 200, body: '{"id":"e1"}' });
    const routes: ReadonlyArray<RouteConfig> = [
      { method: 'GET', resource: '/events/{eventId}', handler: getByTemplateHandler as RouteConfig['handler'], access: 'public' },
    ];
    const handler = createRouter(routes);

    const result = await handler(
      makeEvent({
        httpMethod: 'GET',
        path: '/dev/events/e1',
        resource: '/events/{eventId}',
        pathParameters: { eventId: 'e1' },
      }),
      ctx,
      cb
    );

    expect(result?.statusCode).toBe(200);
    expect(getByTemplateHandler).toHaveBeenCalledTimes(1);
  });

  describe('behind /{proxy+} integration', () => {
    it('resolves route from event.path and sets pathParameters', async () => {
      const getByIdHandler = vi
        .fn()
        .mockImplementation(async (event: APIGatewayProxyEvent) => ({
          statusCode: 200,
          body: JSON.stringify({ playerId: event.pathParameters?.playerId, resource: event.resource }),
        }));
      const routes: ReadonlyArray<RouteConfig> = [
        { method: 'GET', resource: '/players', handler: vi.fn() as RouteConfig['handler'], access: 'public' },
        { method: 'GET', resource: '/players/{playerId}', handler: getByIdHandler as RouteConfig['handler'], access: 'public' },
      ];
      const handler = createRouter(routes);

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/players/abc123',
          resource: '/players/{proxy+}',
          pathParameters: { proxy: 'abc123' },
        }),
        ctx,
        cb
      );

      expect(result?.statusCode).toBe(200);
      expect(JSON.parse(result!.body)).toEqual({ playerId: 'abc123', resource: '/players/{playerId}' });
      expect(getByIdHandler).toHaveBeenCalledTimes(1);
    });

    it('prefers the most specific route when static and parametric templates both match', async () => {
      const meHandler = vi.fn().mockResolvedValue({ statusCode: 200, body: '{"me":true}' });
      const byIdHandler = vi.fn().mockResolvedValue({ statusCode: 200, body: '{"byId":true}' });
      const routes: ReadonlyArray<RouteConfig> = [
        { method: 'GET', resource: '/players/{playerId}', handler: byIdHandler as RouteConfig['handler'], access: 'public' },
        { method: 'GET', resource: '/players/me', handler: meHandler as RouteConfig['handler'], access: 'public' },
      ];
      const handler = createRouter(routes);

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/players/me',
          resource: '/players/{proxy+}',
        }),
        ctx,
        cb
      );

      expect(result?.statusCode).toBe(200);
      expect(meHandler).toHaveBeenCalledTimes(1);
      expect(byIdHandler).not.toHaveBeenCalled();
    });

    it('returns 405 when path matches a registered route but method does not', async () => {
      const routes: ReadonlyArray<RouteConfig> = [
        { method: 'GET', resource: '/players/{playerId}', handler: vi.fn() as RouteConfig['handler'], access: 'public' },
      ];
      const handler = createRouter(routes);

      const result = await handler(
        makeEvent({
          httpMethod: 'DELETE',
          path: '/players/abc123',
          resource: '/players/{proxy+}',
        }),
        ctx,
        cb
      );

      expect(result?.statusCode).toBe(405);
    });

    it('returns 404 when no registered route matches the path', async () => {
      const routes: ReadonlyArray<RouteConfig> = [
        { method: 'GET', resource: '/players', handler: vi.fn() as RouteConfig['handler'], access: 'public' },
      ];
      const handler = createRouter(routes);

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          path: '/players/abc/unknown',
          resource: '/players/{proxy+}',
        }),
        ctx,
        cb
      );

      expect(result?.statusCode).toBe(404);
    });

    it('returns 401 when a protected route has no bearer token (offline=false)', async () => {
      const originalOffline = process.env.IS_OFFLINE;
      process.env.IS_OFFLINE = 'false';
      try {
        const protectedHandler = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
        const routes: ReadonlyArray<RouteConfig> = [
          {
            method: 'POST',
            resource: '/players',
            handler: protectedHandler as RouteConfig['handler'],
            access: STAFF,
          },
        ];
        const handler = createRouter(routes);

        const result = await handler(
          makeEvent({
            httpMethod: 'POST',
            path: '/players',
            resource: '/players',
          }),
          ctx,
          cb
        );

        expect(result?.statusCode).toBe(401);
        expect(protectedHandler).not.toHaveBeenCalled();
      } finally {
        process.env.IS_OFFLINE = originalOffline;
      }
    });

    it('dispatches protected routes in offline mode without a token', async () => {
      const originalOffline = process.env.IS_OFFLINE;
      process.env.IS_OFFLINE = 'true';
      try {
        const protectedHandler = vi
          .fn()
          .mockImplementation(async (event: APIGatewayProxyEvent) => ({
            statusCode: 200,
            body: JSON.stringify({ groups: event.requestContext.authorizer?.groups }),
          }));
        const routes: ReadonlyArray<RouteConfig> = [
          {
            method: 'POST',
            resource: '/players',
            handler: protectedHandler as RouteConfig['handler'],
            access: STAFF,
          },
        ];
        const handler = createRouter(routes);

        const result = await handler(
          makeEvent({
            httpMethod: 'POST',
            path: '/players',
            resource: '/players',
          }),
          ctx,
          cb
        );

        expect(result?.statusCode).toBe(200);
        expect(JSON.parse(result!.body)).toEqual({ groups: 'Admin' });
      } finally {
        process.env.IS_OFFLINE = originalOffline;
      }
    });
  });

  describe('access enforcement', () => {
    const okHandler = () => vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    const gatewayContext = (groups: string) =>
      ({ authorizer: { principalId: 'sub-1', groups } }) as unknown as APIGatewayProxyEvent['requestContext'];
    const post = (requestContext: APIGatewayProxyEvent['requestContext']) =>
      makeEvent({ httpMethod: 'POST', resource: '/things', requestContext });
    const routerFor = (handler: ReturnType<typeof okHandler>, access: RouteConfig['access']) =>
      createRouter([
        { method: 'POST', resource: '/things', handler: handler as RouteConfig['handler'], access },
      ] as ReadonlyArray<RouteConfig>);

    it('returns 403 and skips the handler when the caller lacks the role', async () => {
      const inner = okHandler();
      const result = await routerFor(inner, STAFF)(post(gatewayContext('Wrestler')), ctx, cb);
      expect(result?.statusCode).toBe(403);
      expect(inner).not.toHaveBeenCalled();
    });

    it('returns 403 for a verified token with no groups on a role route', async () => {
      const inner = okHandler();
      const result = await routerFor(inner, STAFF)(post(gatewayContext('')), ctx, cb);
      expect(result?.statusCode).toBe(403);
      expect(inner).not.toHaveBeenCalled();
    });

    it('lets Admin and Moderator through a staff route', async () => {
      const inner = okHandler();
      const router = routerFor(inner, STAFF);
      expect((await router(post(gatewayContext('Admin')), ctx, cb))?.statusCode).toBe(200);
      expect((await router(post(gatewayContext('Moderator')), ctx, cb))?.statusCode).toBe(200);
      expect(inner).toHaveBeenCalledTimes(2);
    });

    it('keeps Moderators out of an admin-only route', async () => {
      const inner = okHandler();
      const result = await routerFor(inner, ADMIN_ONLY)(post(gatewayContext('Moderator')), ctx, cb);
      expect(result?.statusCode).toBe(403);
      expect(inner).not.toHaveBeenCalled();
    });

    it('lets any verified caller reach a self-service route', async () => {
      const inner = okHandler();
      const result = await routerFor(inner, 'self-service')(post(gatewayContext('')), ctx, cb);
      expect(result?.statusCode).toBe(200);
      expect(inner).toHaveBeenCalledTimes(1);
    });

    it('returns 401 on a self-service route with no verified caller', async () => {
      const originalOffline = process.env.IS_OFFLINE;
      process.env.IS_OFFLINE = 'false';
      try {
        const inner = okHandler();
        const result = await routerFor(inner, 'self-service')(
          post({} as APIGatewayProxyEvent['requestContext']),
          ctx,
          cb
        );
        expect(result?.statusCode).toBe(401);
        expect(inner).not.toHaveBeenCalled();
      } finally {
        process.env.IS_OFFLINE = originalOffline;
      }
    });

    it('does not trust groups that arrive without a verified identity', async () => {
      const originalOffline = process.env.IS_OFFLINE;
      process.env.IS_OFFLINE = 'false';
      try {
        const inner = okHandler();
        const context = { authorizer: { groups: 'Admin' } } as unknown as APIGatewayProxyEvent['requestContext'];
        const result = await routerFor(inner, STAFF)(post(context), ctx, cb);
        expect(result?.statusCode).toBe(401);
        expect(inner).not.toHaveBeenCalled();
      } finally {
        process.env.IS_OFFLINE = originalOffline;
      }
    });

    it('refuses to build a router with a route that has no declaration', () => {
      const routes = [{ method: 'POST', resource: '/things', handler: okHandler() }];
      expect(() => createRouter(routes as unknown as ReadonlyArray<RouteConfig>)).toThrow(/no access declaration/);
    });

    it('refuses to build a router with a public non-GET route', () => {
      const routes = [{ method: 'DELETE', resource: '/things', handler: okHandler(), access: 'public' }];
      expect(() => createRouter(routes as unknown as ReadonlyArray<RouteConfig>)).toThrow(/cannot be public/);
    });

    it('refuses to build a router with an empty role list', () => {
      const routes = [{ method: 'POST', resource: '/things', handler: okHandler(), access: { roles: [] } }];
      expect(() => createRouter(routes as unknown as ReadonlyArray<RouteConfig>)).toThrow(/empty role list/);
    });
  });
});
