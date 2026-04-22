import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context, Callback } from 'aws-lambda';
import { createRouter, type RouteConfig } from '../router';

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
      { method: 'GET', resource: '/events', handler: getHandler as RouteConfig['handler'] },
    ];
    const handler = createRouter(routes);

    const result = await handler(makeEvent({ httpMethod: 'GET', resource: '/events' }), ctx, cb);

    expect(result?.statusCode).toBe(200);
    expect(getHandler).toHaveBeenCalledTimes(1);
  });

  it('returns 405 when route does not match', async () => {
    const routes: ReadonlyArray<RouteConfig> = [
      { method: 'GET', resource: '/events', handler: vi.fn() as RouteConfig['handler'] },
    ];
    const handler = createRouter(routes);

    const result = await handler(makeEvent({ httpMethod: 'DELETE', resource: '/events/{eventId}' }), ctx, cb);

    expect(result?.statusCode).toBe(405);
  });

  it('normalizes lowercase request methods', async () => {
    const postHandler = vi.fn().mockResolvedValue({ statusCode: 201, body: '{"created":true}' });
    const routes: ReadonlyArray<RouteConfig> = [
      { method: 'POST', resource: '/events', handler: postHandler as RouteConfig['handler'] },
    ];
    const handler = createRouter(routes);

    const result = await handler(makeEvent({ httpMethod: 'post', resource: '/events' }), ctx, cb);

    expect(result?.statusCode).toBe(201);
    expect(postHandler).toHaveBeenCalledTimes(1);
  });

  it('matches by event.resource and ignores concrete event.path', async () => {
    const getByTemplateHandler = vi.fn().mockResolvedValue({ statusCode: 200, body: '{"id":"e1"}' });
    const routes: ReadonlyArray<RouteConfig> = [
      { method: 'GET', resource: '/events/{eventId}', handler: getByTemplateHandler as RouteConfig['handler'] },
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
        { method: 'GET', resource: '/players', handler: vi.fn() as RouteConfig['handler'] },
        { method: 'GET', resource: '/players/{playerId}', handler: getByIdHandler as RouteConfig['handler'] },
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
        { method: 'GET', resource: '/players/{playerId}', handler: byIdHandler as RouteConfig['handler'] },
        { method: 'GET', resource: '/players/me', handler: meHandler as RouteConfig['handler'] },
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
        { method: 'GET', resource: '/players/{playerId}', handler: vi.fn() as RouteConfig['handler'] },
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
        { method: 'GET', resource: '/players', handler: vi.fn() as RouteConfig['handler'] },
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

    it('returns 401 when requireAuth route has no bearer token (offline=false)', async () => {
      const originalOffline = process.env.IS_OFFLINE;
      process.env.IS_OFFLINE = 'false';
      try {
        const protectedHandler = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
        const routes: ReadonlyArray<RouteConfig> = [
          {
            method: 'POST',
            resource: '/players',
            handler: protectedHandler as RouteConfig['handler'],
            requireAuth: true,
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

    it('dispatches requireAuth routes in offline mode without a token', async () => {
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
            requireAuth: true,
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
});
