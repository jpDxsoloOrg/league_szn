import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockScan, mockQuery } = vi.hoisted(() => ({
  mockScan: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: vi.fn(), put: vi.fn(), scan: mockScan, query: mockQuery,
    update: vi.fn(), delete: vi.fn(), scanAll: vi.fn(), queryAll: vi.fn(),
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

  it('returns all events via scan when no filters provided', async () => {
    mockScan.mockResolvedValue({
      Items: [
        { eventId: 'e1', name: 'Event 1', date: '2025-01-01' },
        { eventId: 'e2', name: 'Event 2', date: '2025-06-15' },
      ],
    });

    const result = await getEvents(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(2);
    expect(body[0].date).toBe('2025-06-15');
    expect(body[1].date).toBe('2025-01-01');
    expect(mockScan).toHaveBeenCalledOnce();
  });

  it('filters events by eventType using DateIndex', async () => {
    mockQuery.mockResolvedValue({
      Items: [{ eventId: 'e1', eventType: 'ppv', date: '2025-04-06' }],
    });
    const event = makeEvent({ queryStringParameters: { eventType: 'ppv' } });

    const result = await getEvents(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toHaveLength(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        IndexName: 'DateIndex',
        ExpressionAttributeValues: { ':eventType': 'ppv' },
      })
    );
  });

  it('filters events by status using StatusIndex', async () => {
    mockQuery.mockResolvedValue({
      Items: [{ eventId: 'e1', status: 'upcoming', date: '2025-05-01' }],
    });
    const event = makeEvent({ queryStringParameters: { status: 'upcoming' } });

    const result = await getEvents(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        IndexName: 'StatusIndex',
        ExpressionAttributeValues: { ':status': 'upcoming' },
      })
    );
  });

  it('filters events by seasonId using SeasonIndex', async () => {
    mockQuery.mockResolvedValue({
      Items: [{ eventId: 'e1', seasonId: 's1', date: '2025-03-01' }],
    });
    const event = makeEvent({ queryStringParameters: { seasonId: 's1' } });

    const result = await getEvents(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        IndexName: 'SeasonIndex',
        ExpressionAttributeValues: { ':seasonId': 's1' },
      })
    );
  });

  it('prioritizes eventType filter over status and seasonId', async () => {
    mockQuery.mockResolvedValue({ Items: [] });
    const event = makeEvent({
      queryStringParameters: { eventType: 'ppv', status: 'upcoming', seasonId: 's1' },
    });

    await getEvents(event, ctx, cb);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ IndexName: 'DateIndex' })
    );
  });

  it('returns empty array when no events exist', async () => {
    mockScan.mockResolvedValue({ Items: undefined });

    const result = await getEvents(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([]);
  });

  it('returns 500 when DynamoDB fails', async () => {
    mockScan.mockRejectedValue(new Error('DynamoDB error'));

    const result = await getEvents(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch events');
  });
});
