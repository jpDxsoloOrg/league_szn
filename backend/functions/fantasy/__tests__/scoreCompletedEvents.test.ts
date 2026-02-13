import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Mocks ----------------------------------------------------------------

const { mockScanAll } = vi.hoisted(() => ({
  mockScanAll: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: vi.fn(),
    put: vi.fn(),
    scan: vi.fn(),
    query: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    scanAll: mockScanAll,
    queryAll: vi.fn(),
  },
  TableNames: {
    EVENTS: 'Events',
    FANTASY_PICKS: 'FantasyPicks',
  },
}));

const { mockCalculateFantasyPoints } = vi.hoisted(() => ({
  mockCalculateFantasyPoints: vi.fn(),
}));

vi.mock('../calculateFantasyPoints', () => ({
  calculateFantasyPoints: mockCalculateFantasyPoints,
}));

import { handler } from '../scoreCompletedEvents';

// ---- Helpers ---------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {},
    httpMethod: 'POST', isBase64Encoded: false, path: '/',
    pathParameters: null, queryStringParameters: null,
    multiValueQueryStringParameters: null, stageVariables: null,
    resource: '', requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

function withAuth(event: APIGatewayProxyEvent, groups = 'Fantasy'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'user', email: 'u@t.com', principalId: 'u1' },
    } as any,
  };
}

// ---- Tests -----------------------------------------------------------------

describe('scoreCompletedEvents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when user lacks Fantasy role', async () => {
    const event = withAuth(makeEvent(), '');
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('scores unscored picks for completed events', async () => {
    // Completed events
    mockScanAll.mockResolvedValueOnce([
      { eventId: 'e1', status: 'completed' },
      { eventId: 'e2', status: 'completed' },
    ]);
    // All picks
    mockScanAll.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', pointsEarned: undefined },
      { eventId: 'e2', fantasyUserId: 'u1', pointsEarned: 20 }, // already scored
    ]);
    mockCalculateFantasyPoints.mockResolvedValueOnce(undefined);

    const event = withAuth(makeEvent());
    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.scoredEventIds).toEqual(['e1']);
    expect(body.message).toBe('Scored 1 event(s)');
    expect(mockCalculateFantasyPoints).toHaveBeenCalledWith('e1');
    expect(mockCalculateFantasyPoints).toHaveBeenCalledTimes(1);
  });

  it('returns empty scored list when no unscored picks exist', async () => {
    mockScanAll.mockResolvedValueOnce([
      { eventId: 'e1', status: 'completed' },
    ]);
    mockScanAll.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', pointsEarned: 30 }, // already scored
    ]);

    const event = withAuth(makeEvent());
    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).scoredEventIds).toEqual([]);
    expect(mockCalculateFantasyPoints).not.toHaveBeenCalled();
  });

  it('treats null pointsEarned as unscored', async () => {
    mockScanAll.mockResolvedValueOnce([
      { eventId: 'e1', status: 'completed' },
    ]);
    mockScanAll.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', pointsEarned: null },
    ]);
    mockCalculateFantasyPoints.mockResolvedValueOnce(undefined);

    const event = withAuth(makeEvent());
    const result = await handler(event, ctx, cb);

    expect(JSON.parse(result!.body).scoredEventIds).toEqual(['e1']);
  });

  it('does not score picks for non-completed events', async () => {
    mockScanAll.mockResolvedValueOnce([]); // no completed events
    mockScanAll.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', pointsEarned: undefined },
    ]);

    const event = withAuth(makeEvent());
    const result = await handler(event, ctx, cb);

    expect(JSON.parse(result!.body).scoredEventIds).toEqual([]);
    expect(mockCalculateFantasyPoints).not.toHaveBeenCalled();
  });

  it('continues scoring other events when one fails', async () => {
    mockScanAll.mockResolvedValueOnce([
      { eventId: 'e1', status: 'completed' },
      { eventId: 'e2', status: 'completed' },
    ]);
    mockScanAll.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', pointsEarned: undefined },
      { eventId: 'e2', fantasyUserId: 'u1', pointsEarned: undefined },
    ]);
    // e1 fails, e2 succeeds
    mockCalculateFantasyPoints.mockRejectedValueOnce(new Error('fail'));
    mockCalculateFantasyPoints.mockResolvedValueOnce(undefined);

    const event = withAuth(makeEvent());
    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    // Only e2 succeeded
    expect(body.scoredEventIds).toEqual(['e2']);
    expect(mockCalculateFantasyPoints).toHaveBeenCalledTimes(2);
  });

  it('returns 500 on unexpected outer error', async () => {
    mockScanAll.mockRejectedValueOnce(new Error('DynamoDB failure'));

    const event = withAuth(makeEvent());
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(500);
  });

  it('de-duplicates event IDs when multiple users have unscored picks', async () => {
    mockScanAll.mockResolvedValueOnce([
      { eventId: 'e1', status: 'completed' },
    ]);
    mockScanAll.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', pointsEarned: undefined },
      { eventId: 'e1', fantasyUserId: 'u2', pointsEarned: undefined },
    ]);
    mockCalculateFantasyPoints.mockResolvedValueOnce(undefined);

    const event = withAuth(makeEvent());
    const result = await handler(event, ctx, cb);

    // Should only call calculateFantasyPoints once for e1, not twice
    expect(mockCalculateFantasyPoints).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result!.body).scoredEventIds).toEqual(['e1']);
  });
});
