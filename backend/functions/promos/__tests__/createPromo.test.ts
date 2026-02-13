import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Hoisted mocks ──────────────────────────────────────────────────

const { mockPut, mockQuery } = vi.hoisted(() => ({
  mockPut: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: vi.fn(), put: mockPut, update: vi.fn(), query: mockQuery,
    scan: vi.fn(), delete: vi.fn(), scanAll: vi.fn(), queryAll: vi.fn(),
  },
  TableNames: { PROMOS: 'Promos', PLAYERS: 'Players' },
}));

vi.mock('uuid', () => ({ v4: () => 'test-promo-uuid' }));

import { handler as createPromo } from '../createPromo';

// ─── Helpers ─────────────────────────────────────────────────────────

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

function withAuth(event: APIGatewayProxyEvent, groups: string, sub = 'user-sub-1'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: sub },
    } as any,
  };
}

const body = (r: any) => JSON.parse(r!.body);
const VALID_CONTENT = 'A'.repeat(50);

// ─── createPromo ─────────────────────────────────────────────────────

describe('createPromo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a promo with required fields and returns 201', async () => {
    mockQuery.mockResolvedValue({
      Items: [{ playerId: 'player-1', userId: 'user-sub-1', name: 'Test Player' }],
    });
    mockPut.mockResolvedValue({});

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ promoType: 'open-mic', content: VALID_CONTENT }) }),
      'Wrestler',
    );

    const result = await createPromo(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const data = body(result);
    expect(data.promoId).toBe('test-promo-uuid');
    expect(data.playerId).toBe('player-1');
    expect(data.promoType).toBe('open-mic');
    expect(data.content).toBe(VALID_CONTENT);
    expect(data.reactions).toEqual({});
    expect(data.reactionCounts).toEqual({ fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 });
    expect(data.isPinned).toBe(false);
    expect(data.isHidden).toBe(false);
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it('includes optional fields when provided', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'player-1', userId: 'user-sub-1' }] });
    mockPut.mockResolvedValue({});

    const event = withAuth(
      makeEvent({
        body: JSON.stringify({
          promoType: 'call-out', content: VALID_CONTENT,
          title: 'My Promo Title', targetPlayerId: 'player-2',
          targetPromoId: 'promo-99', matchId: 'match-5', championshipId: 'champ-3',
        }),
      }),
      'Wrestler',
    );

    const result = await createPromo(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const data = body(result);
    expect(data.title).toBe('My Promo Title');
    expect(data.targetPlayerId).toBe('player-2');
    expect(data.targetPromoId).toBe('promo-99');
    expect(data.matchId).toBe('match-5');
    expect(data.championshipId).toBe('champ-3');
  });

  it('returns 400 when caller is not a Wrestler', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ promoType: 'open-mic', content: VALID_CONTENT }) }),
      'Fantasy',
    );
    const result = await createPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('Only wrestlers can cut promos');
  });

  it('returns 400 when body is null', async () => {
    const event = withAuth(makeEvent({ body: null }), 'Wrestler');
    const result = await createPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('Request body is required');
  });

  it('returns 400 for invalid JSON body', async () => {
    const event = withAuth(makeEvent({ body: '{bad json' }), 'Wrestler');
    const result = await createPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('Invalid JSON in request body');
  });

  it('returns 400 when promoType is missing', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ content: VALID_CONTENT }) }), 'Wrestler',
    );
    const result = await createPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('Valid promoType is required');
  });

  it('returns 400 when promoType is not in the valid list', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ promoType: 'invalid-type', content: VALID_CONTENT }) }),
      'Wrestler',
    );
    const result = await createPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('Valid promoType is required');
  });

  it('returns 400 when content is shorter than 50 characters', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ promoType: 'open-mic', content: 'too short' }) }),
      'Wrestler',
    );
    const result = await createPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('Content must be at least 50 characters');
  });

  it('returns 400 when content exceeds 2000 characters', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ promoType: 'open-mic', content: 'X'.repeat(2001) }) }),
      'Wrestler',
    );
    const result = await createPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('Content must be at most 2000 characters');
  });

  it('returns 400 when content is missing', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ promoType: 'open-mic' }) }), 'Wrestler',
    );
    const result = await createPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('Content must be at least 50 characters');
  });

  it('returns 400 when no player profile is linked to the user', async () => {
    mockQuery.mockResolvedValue({ Items: [] });
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ promoType: 'open-mic', content: VALID_CONTENT }) }),
      'Wrestler',
    );
    const result = await createPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('No player profile linked to your account');
  });

  it('accepts all seven valid promo types', async () => {
    const validTypes = ['open-mic', 'call-out', 'response', 'pre-match', 'post-match', 'championship', 'return'];
    for (const promoType of validTypes) {
      vi.clearAllMocks();
      mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });
      mockPut.mockResolvedValue({});
      const event = withAuth(
        makeEvent({ body: JSON.stringify({ promoType, content: VALID_CONTENT }) }), 'Wrestler',
      );
      const result = await createPromo(event, ctx, cb);
      expect(result!.statusCode).toBe(201);
    }
  });

  it('returns 500 when dynamodb put throws an error', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });
    mockPut.mockRejectedValue(new Error('DynamoDB failure'));
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ promoType: 'open-mic', content: VALID_CONTENT }) }),
      'Wrestler',
    );
    const result = await createPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(500);
    expect(body(result).message).toBe('Failed to create promo');
  });
});
