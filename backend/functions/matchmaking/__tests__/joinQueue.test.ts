import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const {
  mockGet,
  mockPut,
  mockQuery,
  mockDelete,
  mockScanAll,
  mockCreateNotifications,
  mockScheduleMatchInternal,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockQuery: vi.fn(),
  mockDelete: vi.fn(),
  mockScanAll: vi.fn(),
  mockCreateNotifications: vi.fn(),
  mockScheduleMatchInternal: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet,
    put: mockPut,
    query: mockQuery,
    scan: vi.fn(),
    update: vi.fn(),
    delete: mockDelete,
    scanAll: mockScanAll,
    queryAll: vi.fn(),
  },
  TableNames: {
    PLAYERS: 'Players',
    PRESENCE: 'Presence',
    MATCHMAKING_QUEUE: 'MatchmakingQueue',
  },
}));

vi.mock('../../../lib/notifications', () => ({
  createNotification: vi.fn(),
  createNotifications: mockCreateNotifications,
}));

vi.mock('../../matches/scheduleMatch', () => {
  class FakeScheduleMatchError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.name = 'ScheduleMatchError';
      this.statusCode = statusCode;
    }
  }
  return {
    scheduleMatchInternal: mockScheduleMatchInternal,
    ScheduleMatchError: FakeScheduleMatchError,
  };
});

import { handler as joinQueue } from '../joinQueue';

// ─── Helpers ─────────────────────────────────────────────────────────

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
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

function wrestlerEvent(body: object | null, sub = 'user-sub-1'): APIGatewayProxyEvent {
  const base = makeEvent({ body: body ? JSON.stringify(body) : null });
  return {
    ...base,
    requestContext: {
      ...base.requestContext,
      authorizer: { groups: 'Wrestler', username: 'caller', email: 'c@test.com', principalId: sub },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

const futureTtl = Math.floor(Date.now() / 1000) + 300;
const pastTtl = Math.floor(Date.now() / 1000) - 60;

// ─── Tests ───────────────────────────────────────────────────────────

describe('matchmaking/joinQueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queues caller when queue is empty and presence row exists', async () => {
    mockQuery.mockResolvedValueOnce({
      Items: [{ playerId: 'p1', userId: 'user-sub-1', name: 'Caller' }],
    });
    mockGet.mockResolvedValueOnce({ Item: { playerId: 'p1', ttl: futureTtl } });
    mockScanAll.mockResolvedValueOnce([]);
    mockPut.mockResolvedValue({});

    const result = await joinQueue(wrestlerEvent({}));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('queued');
    expect(mockPut).toHaveBeenCalledOnce();
    const putArg = mockPut.mock.calls[0][0];
    expect(putArg.TableName).toBe('MatchmakingQueue');
    expect(putArg.Item.playerId).toBe('p1');
    expect(typeof putArg.Item.ttl).toBe('number');
    expect(mockScheduleMatchInternal).not.toHaveBeenCalled();
  });

  it('matches with a compatible online queued opponent and notifies both players', async () => {
    mockQuery.mockResolvedValueOnce({
      Items: [{ playerId: 'p1', userId: 'user-sub-1', name: 'Caller' }],
    });
    // caller presence
    mockGet.mockResolvedValueOnce({ Item: { playerId: 'p1', ttl: futureTtl } });
    // queue scan returns one compatible candidate
    mockScanAll.mockResolvedValueOnce([
      { playerId: 'p2', joinedAt: 'x', ttl: futureTtl, preferences: {} },
    ]);
    // candidate presence
    mockGet.mockResolvedValueOnce({ Item: { playerId: 'p2', ttl: futureTtl } });
    // candidate player record
    mockGet.mockResolvedValueOnce({
      Item: { playerId: 'p2', userId: 'user-sub-2', name: 'Opponent' },
    });
    mockDelete.mockResolvedValue({});
    mockScheduleMatchInternal.mockResolvedValue({ matchId: 'match-xyz' });
    mockCreateNotifications.mockResolvedValue(undefined);

    const result = await joinQueue(wrestlerEvent({}));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('matched');
    expect(body.matchId).toBe('match-xyz');
    expect(mockScheduleMatchInternal).toHaveBeenCalledOnce();
    expect(mockCreateNotifications).toHaveBeenCalledOnce();
    const notifs = mockCreateNotifications.mock.calls[0][0];
    expect(Array.isArray(notifs)).toBe(true);
    expect(notifs).toHaveLength(2);
  });

  it('ignores expired candidate rows and queues caller instead', async () => {
    mockQuery.mockResolvedValueOnce({
      Items: [{ playerId: 'p1', userId: 'user-sub-1', name: 'Caller' }],
    });
    mockGet.mockResolvedValueOnce({ Item: { playerId: 'p1', ttl: futureTtl } });
    mockScanAll.mockResolvedValueOnce([
      { playerId: 'p2', joinedAt: 'x', ttl: pastTtl, preferences: {} },
    ]);
    mockPut.mockResolvedValue({});

    const result = await joinQueue(wrestlerEvent({}));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).status).toBe('queued');
    expect(mockScheduleMatchInternal).not.toHaveBeenCalled();
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it('returns 400 when caller has no presence row', async () => {
    mockQuery.mockResolvedValueOnce({
      Items: [{ playerId: 'p1', userId: 'user-sub-1', name: 'Caller' }],
    });
    mockGet.mockResolvedValueOnce({ Item: undefined });

    const result = await joinQueue(wrestlerEvent({}));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe(
      'You must appear online before joining the queue.'
    );
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('rejects championship body with 400', async () => {
    const result = await joinQueue(wrestlerEvent({ championshipId: 'c1' }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe(
      'Championship matches cannot be scheduled via matchmaking. Use the challenge or admin scheduling flow.'
    );
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('replaces the caller queue row idempotently on repeat join', async () => {
    // First call
    mockQuery.mockResolvedValueOnce({
      Items: [{ playerId: 'p1', userId: 'user-sub-1', name: 'Caller' }],
    });
    mockGet.mockResolvedValueOnce({ Item: { playerId: 'p1', ttl: futureTtl } });
    mockScanAll.mockResolvedValueOnce([]);
    mockPut.mockResolvedValue({});

    const first = await joinQueue(wrestlerEvent({}));
    expect(first.statusCode).toBe(200);
    expect(JSON.parse(first.body).status).toBe('queued');

    // Second call — only other row in queue is the caller's own, which is skipped
    mockQuery.mockResolvedValueOnce({
      Items: [{ playerId: 'p1', userId: 'user-sub-1', name: 'Caller' }],
    });
    mockGet.mockResolvedValueOnce({ Item: { playerId: 'p1', ttl: futureTtl } });
    mockScanAll.mockResolvedValueOnce([
      { playerId: 'p1', joinedAt: 'x', ttl: futureTtl, preferences: {} },
    ]);

    const second = await joinQueue(wrestlerEvent({}));
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body).status).toBe('queued');

    // Put called twice — idempotent overwrite of the same row
    expect(mockPut).toHaveBeenCalledTimes(2);
    expect(mockPut.mock.calls[0][0].Item.playerId).toBe('p1');
    expect(mockPut.mock.calls[1][0].Item.playerId).toBe('p1');
  });
});
