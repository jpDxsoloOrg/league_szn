import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: vi.fn(),
    put: vi.fn(),
    query: mockQuery,
    scan: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    queryAll: vi.fn(),
    scanAll: vi.fn(),
  },
  TableNames: {
    EVENT_CHECK_INS: 'EventCheckIns',
  },
}));

import { handler as getCheckInSummary } from '../getCheckInSummary';

// ─── Helpers ─────────────────────────────────────────────────────────

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

// ─── Tests ───────────────────────────────────────────────────────────

describe('getCheckInSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns correct counts for a mix of statuses', async () => {
    mockQuery.mockResolvedValue({
      Items: [
        { eventId: 'evt-1', playerId: 'p1', status: 'available' },
        { eventId: 'evt-1', playerId: 'p2', status: 'available' },
        { eventId: 'evt-1', playerId: 'p3', status: 'tentative' },
        { eventId: 'evt-1', playerId: 'p4', status: 'unavailable' },
        { eventId: 'evt-1', playerId: 'p5', status: 'unavailable' },
      ],
      LastEvaluatedKey: undefined,
    });

    const event = withAuth(makeEvent({ pathParameters: { eventId: 'evt-1' } }), 'Wrestler');
    const result = await getCheckInSummary(event);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.eventId).toBe('evt-1');
    expect(body.available).toBe(2);
    expect(body.tentative).toBe(1);
    expect(body.unavailable).toBe(2);
    expect(body.total).toBe(5);
  });

  it('returns all-zero counts when there are no check-ins', async () => {
    mockQuery.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    const event = withAuth(makeEvent({ pathParameters: { eventId: 'evt-1' } }), 'Wrestler');
    const result = await getCheckInSummary(event);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toEqual({
      eventId: 'evt-1',
      available: 0,
      tentative: 0,
      unavailable: 0,
      total: 0,
    });
  });

  it('returns 401 when auth context cannot be extracted', async () => {
    // Build an event with no requestContext so getAuthContext throws, triggering
    // the unauthorized branch in the handler.
    const badEvent = {
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'GET',
      isBase64Encoded: false,
      path: '/',
      pathParameters: { eventId: 'evt-1' },
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: '',
      // Intentionally missing requestContext to force getAuthContext to throw
    } as unknown as APIGatewayProxyEvent;

    const result = await getCheckInSummary(badEvent);

    expect(result!.statusCode).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
