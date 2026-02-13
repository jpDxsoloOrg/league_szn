import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockGet, mockQuery, mockUpdate, mockTransactWrite } = vi.hoisted(() => ({
  mockGet: vi.fn(), mockQuery: vi.fn(), mockUpdate: vi.fn(), mockTransactWrite: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: { get: mockGet, query: mockQuery, update: mockUpdate, transactWrite: mockTransactWrite },
  TableNames: { CHALLENGES: 'Challenges', PLAYERS: 'Players' },
}));

vi.mock('uuid', () => ({ v4: () => 'counter-uuid-5678' }));

import { handler as respondToChallenge } from '../respondToChallenge';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'PUT',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: {} } as any, ...overrides,
  };
}

function withAuth(event: APIGatewayProxyEvent, groups: string, sub = 'user-sub-2'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'challenged-user', email: 'c@test.com', principalId: sub },
    } as any,
  };
}

function respondEvent(body: object) {
  return withAuth(makeEvent({ pathParameters: { challengeId: 'ch1' }, body: JSON.stringify(body) }), 'Wrestler');
}

const pendingChallenge = {
  challengeId: 'ch1', challengerId: 'p1', challengedId: 'p2',
  matchType: 'Singles', status: 'pending', createdAt: '2025-01-15T10:00:00.000Z',
};

/** Set up mocks so the challenged player (p2) is the responder */
function setupValidResponder() {
  mockGet.mockResolvedValue({ Item: pendingChallenge });
  mockQuery.mockResolvedValue({ Items: [{ playerId: 'p2', userId: 'user-sub-2' }] });
}

// ─── respondToChallenge ─────────────────────────────────────────────

describe('respondToChallenge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when user does not have Wrestler role', async () => {
    const event = withAuth(makeEvent({ pathParameters: { challengeId: 'ch1' }, body: JSON.stringify({ action: 'accept' }) }), 'Fantasy');
    const result = await respondToChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toBe('Only wrestlers can respond to challenges');
  });

  it('returns 400 when challengeId is missing from path', async () => {
    const event = withAuth(makeEvent({ body: JSON.stringify({ action: 'accept' }) }), 'Wrestler');
    const result = await respondToChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('challengeId is required');
  });

  it('returns 400 when request body is missing', async () => {
    const event = withAuth(makeEvent({ pathParameters: { challengeId: 'ch1' }, body: null }), 'Wrestler');
    const result = await respondToChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 when request body is invalid JSON', async () => {
    const event = withAuth(makeEvent({ pathParameters: { challengeId: 'ch1' }, body: '{bad' }), 'Wrestler');
    const result = await respondToChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 400 when action is missing or invalid', async () => {
    const r1 = await respondToChallenge(respondEvent({}), ctx, cb);
    expect(r1!.statusCode).toBe(400);
    expect(JSON.parse(r1!.body).message).toBe('action must be accept, decline, or counter');

    vi.clearAllMocks();
    const r2 = await respondToChallenge(respondEvent({ action: 'destroy' }), ctx, cb);
    expect(r2!.statusCode).toBe(400);
  });

  it('returns 404 when challenge does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    const result = await respondToChallenge(respondEvent({ action: 'accept' }), ctx, cb);
    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Challenge not found');
  });

  it('returns 400 when challenge is no longer pending', async () => {
    mockGet.mockResolvedValue({ Item: { ...pendingChallenge, status: 'accepted' } });
    const result = await respondToChallenge(respondEvent({ action: 'accept' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Challenge is no longer pending');
  });

  it('returns 403 when responder is not the challenged player', async () => {
    mockGet.mockResolvedValue({ Item: pendingChallenge });
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p3', userId: 'user-sub-2' }] });
    const result = await respondToChallenge(respondEvent({ action: 'accept' }), ctx, cb);
    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toBe('Only the challenged player can respond');
  });

  it('returns 403 when responder has no player profile', async () => {
    mockGet.mockResolvedValue({ Item: pendingChallenge });
    mockQuery.mockResolvedValue({ Items: [] });
    const result = await respondToChallenge(respondEvent({ action: 'accept' }), ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('accepts a challenge and updates status to accepted', async () => {
    setupValidResponder();
    mockUpdate.mockResolvedValue({});
    const result = await respondToChallenge(respondEvent({ action: 'accept' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.status).toBe('accepted');
    expect(body.updatedAt).toBeDefined();
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it('accepts with responseMessage and includes it in update expression', async () => {
    setupValidResponder();
    mockUpdate.mockResolvedValue({});
    const result = await respondToChallenge(respondEvent({ action: 'accept', responseMessage: 'Bring it!' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).responseMessage).toBe('Bring it!');
    expect(mockUpdate.mock.calls[0][0].UpdateExpression).toContain('responseMessage');
  });

  it('declines a challenge and updates status to declined', async () => {
    setupValidResponder();
    mockUpdate.mockResolvedValue({});
    const result = await respondToChallenge(respondEvent({ action: 'decline' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).status).toBe('declined');
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it('returns 400 when countering without counterMatchType', async () => {
    setupValidResponder();
    const result = await respondToChallenge(respondEvent({ action: 'counter' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('counterMatchType is required when countering');
  });

  it('counters a challenge with transactWrite creating a new reversed challenge', async () => {
    setupValidResponder();
    mockTransactWrite.mockResolvedValue({});

    const result = await respondToChallenge(respondEvent({
      action: 'counter', counterMatchType: 'Cage', counterStipulation: 'Steel Cage',
      counterMessage: 'My terms!', responseMessage: 'Not good enough',
    }), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.original.status).toBe('countered');
    expect(body.original.counteredChallengeId).toBe('counter-uuid-5678');
    expect(body.original.responseMessage).toBe('Not good enough');
    expect(body.counter.challengerId).toBe('p2');
    expect(body.counter.challengedId).toBe('p1');
    expect(body.counter.matchType).toBe('Cage');
    expect(body.counter.stipulation).toBe('Steel Cage');
    expect(body.counter.message).toBe('My terms!');
    expect(body.counter.status).toBe('pending');
    expect(body.counter.expiresAt).toBeDefined();
    expect(mockTransactWrite).toHaveBeenCalledOnce();
    const tx = mockTransactWrite.mock.calls[0][0];
    expect(tx.TransactItems).toHaveLength(2);
    expect(tx.TransactItems[0]).toHaveProperty('Update');
    expect(tx.TransactItems[1]).toHaveProperty('Put');
  });

  it('counters without optional counterStipulation and counterMessage', async () => {
    setupValidResponder();
    mockTransactWrite.mockResolvedValue({});
    const result = await respondToChallenge(respondEvent({ action: 'counter', counterMatchType: 'TLC' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.counter.matchType).toBe('TLC');
    expect(body.counter.stipulation).toBeUndefined();
    expect(body.counter.message).toBeUndefined();
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockGet.mockRejectedValue(new Error('DynamoDB failure'));
    const result = await respondToChallenge(respondEvent({ action: 'accept' }), ctx, cb);
    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to respond to challenge');
  });
});
