import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

const mockListUsers = vi.fn();
const mockUpdateUserRole = vi.fn();
const mockToggleUserEnabled = vi.fn();

vi.mock('../listUsers', () => ({ handler: (...args: unknown[]) => mockListUsers(...args) }));
vi.mock('../updateUserRole', () => ({ handler: (...args: unknown[]) => mockUpdateUserRole(...args) }));
vi.mock('../toggleUserEnabled', () => ({ handler: (...args: unknown[]) => mockToggleUserEnabled(...args) }));

import { handler } from '../handler';

const ctx = {} as Context;
const noopCb = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/admin/users',
    pathParameters: null,
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '/admin/users',
    ...overrides,
  };
}

describe('users router handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListUsers.mockResolvedValue({ statusCode: 200, body: '[]' });
    mockUpdateUserRole.mockResolvedValue({ statusCode: 200, body: '{}' });
    mockToggleUserEnabled.mockResolvedValue({ statusCode: 200, body: '{}' });
  });

  it('GET admin/users calls listUsers', async () => {
    const event = makeEvent({ httpMethod: 'GET', resource: '/admin/users' });
    await handler(event, ctx, noopCb);
    expect(mockListUsers).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockUpdateUserRole).not.toHaveBeenCalled();
    expect(mockToggleUserEnabled).not.toHaveBeenCalled();
  });

  it('POST admin/users/role calls updateUserRole', async () => {
    const event = makeEvent({ httpMethod: 'POST', resource: '/admin/users/role' });
    await handler(event, ctx, noopCb);
    expect(mockUpdateUserRole).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockListUsers).not.toHaveBeenCalled();
    expect(mockToggleUserEnabled).not.toHaveBeenCalled();
  });

  it('POST admin/users/toggle-enabled calls toggleUserEnabled', async () => {
    const event = makeEvent({ httpMethod: 'POST', resource: '/admin/users/toggle-enabled' });
    await handler(event, ctx, noopCb);
    expect(mockToggleUserEnabled).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockListUsers).not.toHaveBeenCalled();
    expect(mockUpdateUserRole).not.toHaveBeenCalled();
  });

  it('PATCH returns 405 Method Not Allowed', async () => {
    const event = makeEvent({ httpMethod: 'PATCH', resource: '/admin/users' });
    const result = await handler(event, ctx, noopCb);
    expect(result).toBeDefined();
    expect(result!.statusCode).toBe(405);
    expect(mockListUsers).not.toHaveBeenCalled();
    expect(mockUpdateUserRole).not.toHaveBeenCalled();
    expect(mockToggleUserEnabled).not.toHaveBeenCalled();
  });
});
