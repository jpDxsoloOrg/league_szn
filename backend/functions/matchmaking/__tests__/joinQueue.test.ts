import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

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
    PLAYERS: 'Players',
    PRESENCE: 'Presence',
    MATCHMAKING_QUEUE: 'MatchmakingQueue',
  },
}));

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

// ─── Tests ───────────────────────────────────────────────────────────

describe('matchmaking/joinQueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queues caller when presence row exists', async () => {
    mockQuery.mockResolvedValueOnce({
      Items: [{ playerId: 'p1', userId: 'user-sub-1', name: 'Caller' }],
    });
    mockGet.mockResolvedValueOnce({ Item: { playerId: 'p1', ttl: futureTtl } });
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
  });

  it('queues caller even when other wrestlers are already in the queue', async () => {
    // Auto-match has been removed: even if compatible opponents exist, the
    // caller should just be added to the queue. Manual challenges (invitations)
    // are the only way to start a match from matchmaking now.
    mockQuery.mockResolvedValueOnce({
      Items: [{ playerId: 'p1', userId: 'user-sub-1', name: 'Caller' }],
    });
    mockGet.mockResolvedValueOnce({ Item: { playerId: 'p1', ttl: futureTtl } });
    mockPut.mockResolvedValue({});

    const result = await joinQueue(wrestlerEvent({}));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('queued');
    expect(body.matchId).toBeUndefined();
  });

  it('persists matchFormat and stipulationId preferences', async () => {
    mockQuery.mockResolvedValueOnce({
      Items: [{ playerId: 'p1', userId: 'user-sub-1', name: 'Caller' }],
    });
    mockGet.mockResolvedValueOnce({ Item: { playerId: 'p1', ttl: futureTtl } });
    mockPut.mockResolvedValue({});

    const result = await joinQueue(
      wrestlerEvent({ matchFormat: 'singles', stipulationId: 'stip-1' })
    );

    expect(result.statusCode).toBe(200);
    const putArg = mockPut.mock.calls[0][0];
    expect(putArg.Item.preferences).toEqual({
      matchFormat: 'singles',
      stipulationId: 'stip-1',
    });
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
    mockQuery.mockResolvedValueOnce({
      Items: [{ playerId: 'p1', userId: 'user-sub-1', name: 'Caller' }],
    });
    mockGet.mockResolvedValueOnce({ Item: { playerId: 'p1', ttl: futureTtl } });
    mockPut.mockResolvedValue({});

    const first = await joinQueue(wrestlerEvent({}));
    expect(first.statusCode).toBe(200);
    expect(JSON.parse(first.body).status).toBe('queued');

    mockQuery.mockResolvedValueOnce({
      Items: [{ playerId: 'p1', userId: 'user-sub-1', name: 'Caller' }],
    });
    mockGet.mockResolvedValueOnce({ Item: { playerId: 'p1', ttl: futureTtl } });

    const second = await joinQueue(wrestlerEvent({}));
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body).status).toBe('queued');

    expect(mockPut).toHaveBeenCalledTimes(2);
    expect(mockPut.mock.calls[0][0].Item.playerId).toBe('p1');
    expect(mockPut.mock.calls[1][0].Item.playerId).toBe('p1');
  });
});
