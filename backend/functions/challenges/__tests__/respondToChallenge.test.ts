import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockGet, mockQuery, mockUpdate, mockPut } = vi.hoisted(() => ({
  mockGet: vi.fn(), mockQuery: vi.fn(), mockUpdate: vi.fn(), mockPut: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: { get: mockGet, query: mockQuery, update: mockUpdate, put: mockPut },
  TableNames: {
    CHALLENGES: 'Challenges', PLAYERS: 'Players', TAG_TEAMS: 'TagTeams',
    MATCHES: 'Matches', EVENTS: 'Events',
  },
}));

vi.mock('../../../lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createNotifications: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('uuid', () => ({ v4: () => 'match-uuid-9999' }));

import { handler as respondToChallenge } from '../respondToChallenge';

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

const pendingSinglesChallenge = {
  challengeId: 'ch1',
  challengerId: 'p1',
  challengedId: 'p2',
  opponentIds: ['p2'],
  responses: { p2: { status: 'pending' } },
  matchType: 'Singles',
  status: 'pending',
  createdAt: '2025-01-15T10:00:00.000Z',
};

// ─── respondToChallenge ─────────────────────────────────────────────

describe('respondToChallenge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when user does not have Wrestler role', async () => {
    const event = withAuth(makeEvent({ pathParameters: { challengeId: 'ch1' }, body: JSON.stringify({ response: 'accepted' }) }), 'Fantasy');
    const result = await respondToChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toBe('Only wrestlers can respond to challenges');
  });

  it('returns 400 when challengeId is missing from path', async () => {
    const event = withAuth(makeEvent({ body: JSON.stringify({ response: 'accepted' }) }), 'Wrestler');
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

  it('returns 400 when response is missing or invalid', async () => {
    const r1 = await respondToChallenge(respondEvent({}), ctx, cb);
    expect(r1!.statusCode).toBe(400);
    expect(JSON.parse(r1!.body).message).toBe('response must be accepted or declined');

    vi.clearAllMocks();
    const r2 = await respondToChallenge(respondEvent({ response: 'destroy' }), ctx, cb);
    expect(r2!.statusCode).toBe(400);
  });

  it('returns 400 when declining without a declineReason', async () => {
    const result = await respondToChallenge(respondEvent({ response: 'declined' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('declineReason is required when declining');
  });

  it('returns 404 when challenge does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    const result = await respondToChallenge(respondEvent({ response: 'accepted' }), ctx, cb);
    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Challenge not found');
  });

  it('returns 400 when challenge is no longer pending', async () => {
    mockGet.mockResolvedValue({ Item: { ...pendingSinglesChallenge, status: 'declined' } });
    const result = await respondToChallenge(respondEvent({ response: 'accepted' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Challenge is no longer pending');
  });

  it('returns 403 when responder is not one of the challenged opponents', async () => {
    mockGet.mockResolvedValue({ Item: pendingSinglesChallenge });
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p3', userId: 'user-sub-2' }] });
    const result = await respondToChallenge(respondEvent({ response: 'accepted' }), ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('auto-schedules a match when all opponents have accepted', async () => {
    // challenge.get, then player query (responder), then challenger player.get, then event query, then match put
    mockGet
      .mockResolvedValueOnce({ Item: pendingSinglesChallenge }) // challenge
      .mockResolvedValueOnce({ Item: { playerId: 'p1', userId: 'challenger-sub' } }) // challenger
      .mockResolvedValue({ Item: { playerId: 'p1', userId: 'challenger-sub', name: 'Challenger' } }); // participant lookups
    mockQuery
      .mockResolvedValueOnce({ Items: [{ playerId: 'p2', userId: 'user-sub-2', name: 'Responder' }] }) // responder
      .mockResolvedValueOnce({ Items: [{ eventId: 'ev1', name: 'Raw', date: '2026-04-10T20:00:00.000Z' }] }); // next event
    mockUpdate.mockResolvedValue({});
    mockPut.mockResolvedValue({});

    const result = await respondToChallenge(respondEvent({ response: 'accepted' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.status).toBe('auto_scheduled');
    expect(body.matchId).toBe('match-uuid-9999');
    expect(mockPut).toHaveBeenCalledOnce(); // match created
  });

  it('marks challenge declined when the sole opponent declines with reason', async () => {
    mockGet
      .mockResolvedValueOnce({ Item: pendingSinglesChallenge }) // challenge
      .mockResolvedValueOnce({ Item: { playerId: 'p1', userId: 'challenger-sub' } }); // challenger
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p2', userId: 'user-sub-2', name: 'Responder' }] });
    mockUpdate.mockResolvedValue({});

    const result = await respondToChallenge(
      respondEvent({ response: 'declined', declineReason: 'Not interested' }),
      ctx, cb,
    );
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.status).toBe('declined');
    expect(body.responses.p2.declineReason).toBe('Not interested');
  });

  it('keeps challenge pending when only one of multiple opponents accepts', async () => {
    const multiChallenge = {
      ...pendingSinglesChallenge,
      opponentIds: ['p2', 'p3'],
      responses: { p2: { status: 'pending' }, p3: { status: 'pending' } },
    };
    mockGet
      .mockResolvedValueOnce({ Item: multiChallenge })
      .mockResolvedValueOnce({ Item: { playerId: 'p1', userId: 'challenger-sub' } });
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p2', userId: 'user-sub-2', name: 'Responder' }] });
    mockUpdate.mockResolvedValue({});

    const result = await respondToChallenge(respondEvent({ response: 'accepted' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.status).toBe('pending');
    expect(body.responses.p2.status).toBe('accepted');
    expect(body.responses.p3.status).toBe('pending');
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockGet.mockRejectedValue(new Error('DynamoDB failure'));
    const result = await respondToChallenge(respondEvent({ response: 'accepted' }), ctx, cb);
    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to respond to challenge');
  });
});
