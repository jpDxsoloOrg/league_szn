import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockScanAll, mockQueryAll } = vi.hoisted(() => ({
  mockScanAll: vi.fn(),
  mockQueryAll: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: vi.fn(), put: vi.fn(), scan: vi.fn(), query: vi.fn(),
    update: vi.fn(), delete: vi.fn(), scanAll: mockScanAll, queryAll: mockQueryAll,
  },
  TableNames: { EVENTS: 'Events' },
}));

import { handler as getEvents } from '../getEvents';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'GET',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: {} } as any, ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('getEvents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all events via scanAll when no filters provided', async () => {
    mockScanAll.mockResolvedValue([
      { eventId: 'e1', name: 'Event 1', date: '2025-01-01' },
      { eventId: 'e2', name: 'Event 2', date: '2025-06-15' },
    ]);

    const result = await getEvents(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(2);
    expect(body[0].date).toBe('2025-06-15');
    expect(body[1].date).toBe('2025-01-01');
    expect(mockScanAll).toHaveBeenCalledOnce();
  });

  it('filters events by eventType using DateIndex', async () => {
    mockQueryAll.mockResolvedValue([{ eventId: 'e1', eventType: 'ppv', date: '2025-04-06' }]);
    const event = makeEvent({ queryStringParameters: { eventType: 'ppv' } });

    const result = await getEvents(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toHaveLength(1);
    expect(mockQueryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        IndexName: 'DateIndex',
        ExpressionAttributeValues: { ':eventType': 'ppv' },
      })
    );
  });

  it('filters events by status using StatusIndex', async () => {
    mockQueryAll.mockResolvedValue([{ eventId: 'e1', status: 'upcoming', date: '2025-05-01' }]);
    const event = makeEvent({ queryStringParameters: { status: 'upcoming' } });

    const result = await getEvents(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockQueryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        IndexName: 'StatusIndex',
        ExpressionAttributeValues: { ':status': 'upcoming' },
      })
    );
  });

  it('filters events by seasonId using SeasonIndex', async () => {
    mockQueryAll.mockResolvedValue([{ eventId: 'e1', seasonId: 's1', date: '2025-03-01' }]);
    const event = makeEvent({ queryStringParameters: { seasonId: 's1' } });

    const result = await getEvents(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockQueryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        IndexName: 'SeasonIndex',
        ExpressionAttributeValues: { ':seasonId': 's1' },
      })
    );
  });

  it('prioritizes eventType filter over status and seasonId', async () => {
    mockQueryAll.mockResolvedValue([]);
    const event = makeEvent({
      queryStringParameters: { eventType: 'ppv', status: 'upcoming', seasonId: 's1' },
    });

    await getEvents(event, ctx, cb);

    expect(mockQueryAll).toHaveBeenCalledWith(
      expect.objectContaining({ IndexName: 'DateIndex' })
    );
  });

  it('returns empty array when no events exist', async () => {
    mockScanAll.mockResolvedValue([]);

    const result = await getEvents(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([]);
  });

  it('returns 500 when DynamoDB fails', async () => {
    mockScanAll.mockRejectedValue(new Error('DynamoDB error'));

    const result = await getEvents(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch events');
  });
});
