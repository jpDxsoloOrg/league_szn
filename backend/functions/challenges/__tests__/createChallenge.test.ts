import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockGet, mockPut, mockQuery } = vi.hoisted(() => ({
  mockGet: vi.fn(), mockPut: vi.fn(), mockQuery: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: { get: mockGet, put: mockPut, query: mockQuery },
  TableNames: { CHALLENGES: 'Challenges', PLAYERS: 'Players', TAG_TEAMS: 'TagTeams' },
}));

vi.mock('../../../lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createNotifications: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

import { handler as createChallenge } from '../createChallenge';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'POST',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: {} } as any, ...overrides,
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

function wrestlerEvent(body: object) {
  return withAuth(makeEvent({ body: JSON.stringify(body) }), 'Wrestler');
}

// ─── createChallenge ────────────────────────────────────────────────

describe('createChallenge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a challenge with required fields and returns 201', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });
    mockGet.mockResolvedValue({ Item: { playerId: 'p2', name: 'The Rock' } });
    mockPut.mockResolvedValue({});

    const result = await createChallenge(wrestlerEvent({ challengedId: 'p2', matchType: 'Singles' }), ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.challengeId).toBe('test-uuid-1234');
    expect(body.challengerId).toBe('p1');
    expect(body.challengedId).toBe('p2');
    expect(body.matchType).toBe('Singles');
    expect(body.status).toBe('pending');
    expect(body.expiresAt).toBeDefined();
    expect(body.createdAt).toBeDefined();
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it('includes optional fields (stipulation, championshipId, challengeNote) when provided', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });
    mockGet.mockResolvedValue({ Item: { playerId: 'p2' } });
    mockPut.mockResolvedValue({});

    const result = await createChallenge(
      wrestlerEvent({ challengedId: 'p2', matchType: 'Cage', stipulation: 'Steel Cage', championshipId: 'title-1', challengeNote: 'You are going down!' }),
      ctx, cb,
    );

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.stipulation).toBe('Steel Cage');
    expect(body.championshipId).toBe('title-1');
    expect(body.challengeNote).toBe('You are going down!');
  });

  it('omits optional fields when not provided', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });
    mockGet.mockResolvedValue({ Item: { playerId: 'p2' } });
    mockPut.mockResolvedValue({});

    const result = await createChallenge(wrestlerEvent({ challengedId: 'p2', matchType: 'Singles' }), ctx, cb);
    const body = JSON.parse(result!.body);
    expect(body.stipulation).toBeUndefined();
    expect(body.championshipId).toBeUndefined();
    expect(body.challengeNote).toBeUndefined();
  });

  it('accepts opponentIds[] and builds a responses map', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1', name: 'Challenger' }] });
    mockGet.mockImplementation(({ Key }: { Key: { playerId: string } }) => {
      return Promise.resolve({ Item: { playerId: Key.playerId } });
    });
    mockPut.mockResolvedValue({});

    const result = await createChallenge(
      wrestlerEvent({ opponentIds: ['p2', 'p3'], matchType: 'Triple Threat' }),
      ctx, cb,
    );
    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.opponentIds).toEqual(['p2', 'p3']);
    expect(body.challengedId).toBe('p2');
    expect(body.responses.p2.status).toBe('pending');
    expect(body.responses.p3.status).toBe('pending');
  });

  it('returns 400 when user does not have Wrestler role', async () => {
    const event = withAuth(makeEvent({ body: JSON.stringify({ challengedId: 'p2', matchType: 'Singles' }) }), 'Fantasy');
    const result = await createChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Only wrestlers can issue challenges');
  });

  it('returns 400 when request body is missing', async () => {
    const result = await createChallenge(withAuth(makeEvent({ body: null }), 'Wrestler'), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 when request body is invalid JSON', async () => {
    const result = await createChallenge(withAuth(makeEvent({ body: 'not-json{' }), 'Wrestler'), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 400 when neither opponentIds nor challengedId is provided', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });
    const result = await createChallenge(wrestlerEvent({ matchType: 'Singles' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('opponentIds is required');
  });

  it('returns 400 when matchType is missing', async () => {
    const result = await createChallenge(wrestlerEvent({ challengedId: 'p2' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('matchType is required');
  });

  it('returns 400 when no player profile is linked to the user account', async () => {
    mockQuery.mockResolvedValue({ Items: [] });
    const result = await createChallenge(wrestlerEvent({ challengedId: 'p2', matchType: 'Singles' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('No player profile linked to your account');
  });

  it('returns 400 when trying to challenge yourself', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });
    const result = await createChallenge(wrestlerEvent({ challengedId: 'p1', matchType: 'Singles' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('You cannot challenge yourself');
  });

  it('returns 400 when challenged player does not exist', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });
    mockGet.mockResolvedValue({ Item: undefined });
    const result = await createChallenge(wrestlerEvent({ challengedId: 'nonexistent', matchType: 'Singles' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Challenged player not found');
  });

  it('sets 7-day expiration on created challenge', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });
    mockGet.mockResolvedValue({ Item: { playerId: 'p2' } });
    mockPut.mockResolvedValue({});

    const result = await createChallenge(wrestlerEvent({ challengedId: 'p2', matchType: 'Singles' }), ctx, cb);
    const body = JSON.parse(result!.body);
    const diffDays = (new Date(body.expiresAt).getTime() - new Date(body.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });

  it('allows Admin to create challenges (hasRole grants Admin access)', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'admin-sub' }] });
    mockGet.mockResolvedValue({ Item: { playerId: 'p2' } });
    mockPut.mockResolvedValue({});

    const event = withAuth(makeEvent({ body: JSON.stringify({ challengedId: 'p2', matchType: 'Singles' }) }), 'Admin', 'admin-sub');
    const result = await createChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(201);
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockQuery.mockRejectedValue(new Error('DynamoDB failure'));
    const result = await createChallenge(wrestlerEvent({ challengedId: 'p2', matchType: 'Singles' }), ctx, cb);
    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to create challenge');
  });
});
