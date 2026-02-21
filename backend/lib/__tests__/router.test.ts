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
});
