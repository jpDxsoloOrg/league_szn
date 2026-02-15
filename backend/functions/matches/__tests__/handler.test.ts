import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

const mockGetMatches = vi.fn();
const mockScheduleMatch = vi.fn();
const mockRecordResult = vi.fn();

vi.mock('../getMatches', () => ({ handler: (...args: unknown[]) => mockGetMatches(...args) }));
vi.mock('../scheduleMatch', () => ({ handler: (...args: unknown[]) => mockScheduleMatch(...args) }));
vi.mock('../recordResult', () => ({ handler: (...args: unknown[]) => mockRecordResult(...args) }));

import { handler } from '../handler';

const ctx = {} as Context;
const noopCb = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/matches',
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

describe('matches router handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMatches.mockResolvedValue({ statusCode: 200, body: '[]' });
    mockScheduleMatch.mockResolvedValue({ statusCode: 201, body: '{}' });
    mockRecordResult.mockResolvedValue({ statusCode: 200, body: '{}' });
  });

  it('GET without matchId calls getMatches', async () => {
    const event = makeEvent({ httpMethod: 'GET', pathParameters: null });
    await handler(event, ctx, noopCb);
    expect(mockGetMatches).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockScheduleMatch).not.toHaveBeenCalled();
    expect(mockRecordResult).not.toHaveBeenCalled();
  });

  it('POST without matchId calls scheduleMatch', async () => {
    const event = makeEvent({ httpMethod: 'POST', pathParameters: null });
    await handler(event, ctx, noopCb);
    expect(mockScheduleMatch).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockGetMatches).not.toHaveBeenCalled();
    expect(mockRecordResult).not.toHaveBeenCalled();
  });

  it('PUT with matchId calls recordResult', async () => {
    const event = makeEvent({
      httpMethod: 'PUT',
      pathParameters: { matchId: 'm1' },
    });
    await handler(event, ctx, noopCb);
    expect(mockRecordResult).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockGetMatches).not.toHaveBeenCalled();
    expect(mockScheduleMatch).not.toHaveBeenCalled();
  });

  it('PATCH returns 405 Method Not Allowed', async () => {
    const event = makeEvent({ httpMethod: 'PATCH' });
    const result = await handler(event, ctx, noopCb);
    expect(result).toBeDefined();
    expect(result!.statusCode).toBe(405);
    expect(mockGetMatches).not.toHaveBeenCalled();
    expect(mockScheduleMatch).not.toHaveBeenCalled();
    expect(mockRecordResult).not.toHaveBeenCalled();
  });
});
