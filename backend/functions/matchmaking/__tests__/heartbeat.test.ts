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
  },
}));

import { handler as heartbeat } from '../heartbeat';

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
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('matchmaking/heartbeat', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts a presence row with playerId, lastSeenAt, and ttl for a wrestler', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });
    mockPut.mockResolvedValue({});

    const result = await heartbeat(withAuth(makeEvent(), 'Wrestler'));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.playerId).toBe('p1');
    expect(body.lastSeenAt).toBeDefined();

    expect(mockPut).toHaveBeenCalledOnce();
    const putArg = mockPut.mock.calls[0][0];
    expect(putArg.TableName).toBe('Presence');
    expect(putArg.Item.playerId).toBe('p1');
    expect(typeof putArg.Item.lastSeenAt).toBe('string');
    expect(typeof putArg.Item.ttl).toBe('number');
    expect(putArg.Item.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('returns 403 for a non-wrestler caller', async () => {
    const result = await heartbeat(withAuth(makeEvent(), 'Fantasy'));

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe('Only wrestlers can send presence heartbeats');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('returns 400 when caller has no linked player profile', async () => {
    mockQuery.mockResolvedValue({ Items: [] });

    const result = await heartbeat(withAuth(makeEvent(), 'Wrestler'));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('No player profile linked to your account');
    expect(mockPut).not.toHaveBeenCalled();
  });
});
