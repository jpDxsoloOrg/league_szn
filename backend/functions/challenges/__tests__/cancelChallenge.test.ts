import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockGet, mockPut, mockScan, mockQuery, mockUpdate, mockDelete, mockScanAll, mockQueryAll } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockScan: vi.fn(),
  mockQuery: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockScanAll: vi.fn(),
  mockQueryAll: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet,
    put: mockPut,
    scan: mockScan,
    query: mockQuery,
    update: mockUpdate,
    delete: mockDelete,
    scanAll: mockScanAll,
    queryAll: mockQueryAll,
  },
  TableNames: {
    CHALLENGES: 'Challenges',
    PLAYERS: 'Players',
    TAG_TEAMS: 'TagTeams',
  },
}));

import { handler as cancelChallenge } from '../cancelChallenge';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'PUT',
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

function withAuth(event: APIGatewayProxyEvent, groups: string, sub = 'user-sub-1'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: sub },
    } as any,
  };
}

const pendingChallenge = {
  challengeId: 'ch1',
  challengerId: 'p1',
  challengedId: 'p2',
  matchType: 'Singles',
  status: 'pending',
  createdAt: '2025-01-15T10:00:00.000Z',
};

// ─── cancelChallenge ────────────────────────────────────────────────

describe('cancelChallenge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when challengeId is missing from path', async () => {
    const event = withAuth(
      makeEvent({ pathParameters: null }),
      'Wrestler',
    );

    const result = await cancelChallenge(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('challengeId is required');
  });

  it('returns 404 when challenge does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });

    const event = withAuth(
      makeEvent({ pathParameters: { challengeId: 'nonexistent' } }),
      'Wrestler',
    );

    const result = await cancelChallenge(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Challenge not found');
  });

  it('returns 400 when challenge is not pending', async () => {
    mockGet.mockResolvedValue({
      Item: { ...pendingChallenge, status: 'accepted' },
    });

    const event = withAuth(
      makeEvent({ pathParameters: { challengeId: 'ch1' } }),
      'Wrestler',
    );

    const result = await cancelChallenge(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Only pending challenges can be cancelled');
  });

  it('returns 403 when non-challenger non-admin tries to cancel', async () => {
    mockGet.mockResolvedValue({ Item: pendingChallenge });
    // Player lookup returns a different player (p3, not p1 the challenger)
    mockQuery.mockResolvedValue({
      Items: [{ playerId: 'p3', userId: 'user-sub-1' }],
    });

    const event = withAuth(
      makeEvent({ pathParameters: { challengeId: 'ch1' } }),
      'Wrestler',
    );

    const result = await cancelChallenge(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toBe('Only the challenger or an admin can cancel a challenge');
  });

  it('returns 403 when user has no player profile and is not admin', async () => {
    mockGet.mockResolvedValue({ Item: pendingChallenge });
    mockQuery.mockResolvedValue({ Items: [] });

    const event = withAuth(
      makeEvent({ pathParameters: { challengeId: 'ch1' } }),
      'Wrestler',
    );

    const result = await cancelChallenge(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toBe('Player not found for current user');
  });

  it('cancels challenge when user is the challenger', async () => {
    mockGet.mockResolvedValue({ Item: pendingChallenge });
    mockQuery.mockResolvedValue({
      Items: [{ playerId: 'p1', userId: 'user-sub-1' }],
    });
    mockUpdate.mockResolvedValue({});

    const event = withAuth(
      makeEvent({ pathParameters: { challengeId: 'ch1' } }),
      'Wrestler',
    );

    const result = await cancelChallenge(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.status).toBe('cancelled');
    expect(body.updatedAt).toBeDefined();
    expect(mockUpdate).toHaveBeenCalledOnce();
    // Verify update expression sets status to cancelled
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.ExpressionAttributeValues[':status']).toBe('cancelled');
  });

  it('allows Admin to cancel any challenge without player lookup', async () => {
    mockGet.mockResolvedValue({ Item: pendingChallenge });
    mockUpdate.mockResolvedValue({});

    const event = withAuth(
      makeEvent({ pathParameters: { challengeId: 'ch1' } }),
      'Admin',
      'admin-sub',
    );

    const result = await cancelChallenge(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.status).toBe('cancelled');
    // Admin bypasses player lookup entirely
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('allows Moderator to cancel challenges (hasRole grants Moderator access)', async () => {
    mockGet.mockResolvedValue({ Item: pendingChallenge });
    mockQuery.mockResolvedValue({
      Items: [{ playerId: 'p1', userId: 'mod-sub' }],
    });
    mockUpdate.mockResolvedValue({});

    const event = withAuth(
      makeEvent({ pathParameters: { challengeId: 'ch1' } }),
      'Moderator',
      'mod-sub',
    );

    const result = await cancelChallenge(event, ctx, cb);

    // Moderator is not Admin, so it goes through player check
    // Moderator's player is p1 which matches challengerId, so it should succeed
    expect(result!.statusCode).toBe(200);
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockGet.mockRejectedValue(new Error('DynamoDB failure'));

    const event = withAuth(
      makeEvent({ pathParameters: { challengeId: 'ch1' } }),
      'Wrestler',
    );

    const result = await cancelChallenge(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to cancel challenge');
  });
});
