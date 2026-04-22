import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

const mockListWrestlers = vi.fn();
const mockCreateWrestler = vi.fn();
const mockGetWrestler = vi.fn();
const mockUpdateWrestler = vi.fn();
const mockDeleteWrestler = vi.fn();
const mockImportWrestlers = vi.fn();

vi.mock('../listWrestlers', () => ({
  handler: (...args: unknown[]) => mockListWrestlers(...args),
}));
vi.mock('../createWrestler', () => ({
  handler: (...args: unknown[]) => mockCreateWrestler(...args),
}));
vi.mock('../getWrestler', () => ({
  handler: (...args: unknown[]) => mockGetWrestler(...args),
}));
vi.mock('../updateWrestler', () => ({
  handler: (...args: unknown[]) => mockUpdateWrestler(...args),
}));
vi.mock('../deleteWrestler', () => ({
  handler: (...args: unknown[]) => mockDeleteWrestler(...args),
}));
vi.mock('../importWrestlers', () => ({
  handler: (...args: unknown[]) => mockImportWrestlers(...args),
}));

import { handler } from '../handler';

const ctx = {} as Context;
const noopCb = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/wrestlers',
    pathParameters: null,
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '/wrestlers',
    ...overrides,
  };
}

describe('wrestlers router handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListWrestlers.mockResolvedValue({ statusCode: 200, body: '[]' });
    mockCreateWrestler.mockResolvedValue({ statusCode: 201, body: '{}' });
    mockGetWrestler.mockResolvedValue({ statusCode: 200, body: '{}' });
    mockUpdateWrestler.mockResolvedValue({ statusCode: 200, body: '{}' });
    mockDeleteWrestler.mockResolvedValue({ statusCode: 204, body: '' });
    mockImportWrestlers.mockResolvedValue({ statusCode: 200, body: '{}' });
  });

  it('GET /wrestlers calls listWrestlers', async () => {
    const event = makeEvent({ httpMethod: 'GET', resource: '/wrestlers' });
    const result = await handler(event, ctx, noopCb);
    expect(mockListWrestlers).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockCreateWrestler).not.toHaveBeenCalled();
    expect(mockGetWrestler).not.toHaveBeenCalled();
    expect(mockUpdateWrestler).not.toHaveBeenCalled();
    expect(mockDeleteWrestler).not.toHaveBeenCalled();
    expect(mockImportWrestlers).not.toHaveBeenCalled();
    expect(result!.statusCode).toBe(200);
  });

  it('POST /wrestlers calls createWrestler', async () => {
    const event = makeEvent({ httpMethod: 'POST', resource: '/wrestlers' });
    const result = await handler(event, ctx, noopCb);
    expect(mockCreateWrestler).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockListWrestlers).not.toHaveBeenCalled();
    expect(mockImportWrestlers).not.toHaveBeenCalled();
    expect(result!.statusCode).toBe(201);
  });

  it('POST /wrestlers/import routes to importWrestlers, NOT createWrestler', async () => {
    const event = makeEvent({
      httpMethod: 'POST',
      resource: '/wrestlers/import',
    });
    const result = await handler(event, ctx, noopCb);
    expect(mockImportWrestlers).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockCreateWrestler).not.toHaveBeenCalled();
    expect(mockListWrestlers).not.toHaveBeenCalled();
    expect(result!.statusCode).toBe(200);
  });

  it('GET /wrestlers/{wrestlerId} calls getWrestler', async () => {
    const event = makeEvent({
      httpMethod: 'GET',
      resource: '/wrestlers/{wrestlerId}',
      pathParameters: { wrestlerId: 'w-1' },
    });
    const result = await handler(event, ctx, noopCb);
    expect(mockGetWrestler).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockListWrestlers).not.toHaveBeenCalled();
    expect(result!.statusCode).toBe(200);
  });

  it('PUT /wrestlers/{wrestlerId} calls updateWrestler', async () => {
    const event = makeEvent({
      httpMethod: 'PUT',
      resource: '/wrestlers/{wrestlerId}',
      pathParameters: { wrestlerId: 'w-1' },
    });
    const result = await handler(event, ctx, noopCb);
    expect(mockUpdateWrestler).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockCreateWrestler).not.toHaveBeenCalled();
    expect(result!.statusCode).toBe(200);
  });

  it('DELETE /wrestlers/{wrestlerId} calls deleteWrestler', async () => {
    const event = makeEvent({
      httpMethod: 'DELETE',
      resource: '/wrestlers/{wrestlerId}',
      pathParameters: { wrestlerId: 'w-1' },
    });
    const result = await handler(event, ctx, noopCb);
    expect(mockDeleteWrestler).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockUpdateWrestler).not.toHaveBeenCalled();
    expect(result!.statusCode).toBe(204);
  });

  it('PATCH /wrestlers returns 405 Method Not Allowed', async () => {
    const event = makeEvent({
      httpMethod: 'PATCH',
      resource: '/wrestlers',
    });
    const result = await handler(event, ctx, noopCb);
    expect(result!.statusCode).toBe(405);
    expect(mockListWrestlers).not.toHaveBeenCalled();
    expect(mockCreateWrestler).not.toHaveBeenCalled();
  });
});
