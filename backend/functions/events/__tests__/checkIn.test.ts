import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockGet, mockPut, mockQuery } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet,
    put: mockPut,
    query: mockQuery,
    scan: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    scanAll: vi.fn(),
    queryAll: vi.fn(),
  },
  TableNames: {
    EVENTS: 'Events',
    EVENT_CHECK_INS: 'EventCheckIns',
    PLAYERS: 'Players',
  },
}));

import { handler as checkIn } from '../checkIn';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

function withAuth(
  event: APIGatewayProxyEvent,
  groups: string,
  sub = 'user-sub-1',
): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: sub },
    } as any,
  };
}

function wrestlerEvent(eventId: string | null, body: object | null) {
  return withAuth(
    makeEvent({
      pathParameters: eventId ? { eventId } : null,
      body: body ? JSON.stringify(body) : null,
    }),
    'Wrestler',
  );
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('checkIn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a check-in for a wrestler and returns 200 with the row', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });
    mockGet.mockResolvedValue({
      Item: { eventId: 'evt-1', status: 'upcoming', date: '2026-05-01T00:00:00.000Z' },
    });
    mockPut.mockResolvedValue({});

    const result = await checkIn(wrestlerEvent('evt-1', { status: 'available' }), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.eventId).toBe('evt-1');
    expect(body.playerId).toBe('p1');
    expect(body.status).toBe('available');
    expect(body.checkedInAt).toBeDefined();
    expect(body.ttl).toBeDefined();
    expect(mockPut).toHaveBeenCalledOnce();
    const putArg = mockPut.mock.calls[0][0];
    expect(putArg.TableName).toBe('EventCheckIns');
    expect(putArg.Item.playerId).toBe('p1');
    expect(putArg.Item.status).toBe('available');
  });

  it('updates an existing check-in (idempotent put) when status changes', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });
    mockGet.mockResolvedValue({
      Item: { eventId: 'evt-1', status: 'upcoming', date: '2026-05-01T00:00:00.000Z' },
    });
    mockPut.mockResolvedValue({});

    const result = await checkIn(wrestlerEvent('evt-1', { status: 'tentative' }), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.status).toBe('tentative');
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it('returns 403 for non-wrestler caller', async () => {
    const event = withAuth(
      makeEvent({
        pathParameters: { eventId: 'evt-1' },
        body: JSON.stringify({ status: 'available' }),
      }),
      'Fantasy',
    );

    const result = await checkIn(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toBe('Only wrestlers can check in to events');
  });

  it('returns 400 for a completed event', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });
    mockGet.mockResolvedValue({
      Item: { eventId: 'evt-1', status: 'completed', date: '2026-01-01T00:00:00.000Z' },
    });

    const result = await checkIn(wrestlerEvent('evt-1', { status: 'available' }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe(
      'Check-in is only allowed for upcoming or in-progress events',
    );
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('returns 404 for non-existent event', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });
    mockGet.mockResolvedValue({ Item: undefined });

    const result = await checkIn(wrestlerEvent('evt-missing', { status: 'available' }), ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Event not found');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('returns 400 for missing status in body', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });

    const result = await checkIn(wrestlerEvent('evt-1', {}), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe(
      'status must be one of available, tentative, unavailable',
    );
  });

  it('returns 400 for invalid status value', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });

    const result = await checkIn(wrestlerEvent('evt-1', { status: 'maybe' }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe(
      'status must be one of available, tentative, unavailable',
    );
  });

  it('returns 400 when caller has no linked player profile', async () => {
    mockQuery.mockResolvedValue({ Items: [] });

    const result = await checkIn(wrestlerEvent('evt-1', { status: 'available' }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('No player profile linked to your account');
    expect(mockPut).not.toHaveBeenCalled();
  });
});
