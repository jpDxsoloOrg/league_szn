import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

const mockGetContenders = vi.fn();
const mockCalculateRankings = vi.fn();

vi.mock('../getContenders', () => ({ handler: (...args: unknown[]) => mockGetContenders(...args) }));
vi.mock('../calculateRankings', () => ({ handler: (...args: unknown[]) => mockCalculateRankings(...args) }));

import { handler } from '../handler';

const ctx = {} as Context;
const noopCb = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/championships/ch1/contenders',
    pathParameters: null,
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '',
    ...overrides,
  };
}

describe('contenders router handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetContenders.mockResolvedValue({ statusCode: 200, body: '[]' });
    mockCalculateRankings.mockResolvedValue({ statusCode: 200, body: '{}' });
  });

  it('GET with championshipId calls getContenders', async () => {
    const event = makeEvent({
      httpMethod: 'GET',
      pathParameters: { championshipId: 'ch1' },
    });
    await handler(event, ctx, noopCb);
    expect(mockGetContenders).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockCalculateRankings).not.toHaveBeenCalled();
  });

  it('POST path containing recalculate calls calculateRankings', async () => {
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/admin/contenders/recalculate',
    });
    await handler(event, ctx, noopCb);
    expect(mockCalculateRankings).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockGetContenders).not.toHaveBeenCalled();
  });

  it('PATCH returns 405 Method Not Allowed', async () => {
    const event = makeEvent({ httpMethod: 'PATCH' });
    const result = await handler(event, ctx, noopCb);
    expect(result).toBeDefined();
    expect(result!.statusCode).toBe(405);
    expect(mockGetContenders).not.toHaveBeenCalled();
    expect(mockCalculateRankings).not.toHaveBeenCalled();
  });
});
