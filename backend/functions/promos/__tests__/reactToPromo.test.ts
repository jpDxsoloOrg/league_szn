import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Hoisted mocks ──────────────────────────────────────────────────

const { mockGet, mockUpdate } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet, put: vi.fn(), update: mockUpdate, query: vi.fn(),
    scan: vi.fn(), delete: vi.fn(), scanAll: vi.fn(), queryAll: vi.fn(),
  },
  TableNames: { PROMOS: 'Promos', PLAYERS: 'Players' },
}));

import { handler as reactToPromo } from '../reactToPromo';

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

// ─── reactToPromo ────────────────────────────────────────────────────

describe('reactToPromo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when caller is not a Wrestler', async () => {
    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'p1' }, body: JSON.stringify({ reaction: 'fire' }) }),
      'Fantasy',
    );
    const result = await reactToPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('returns 400 when promoId is missing from path', async () => {
    const event = withAuth(
      makeEvent({ pathParameters: null, body: JSON.stringify({ reaction: 'fire' }) }),
      'Wrestler',
    );
    const result = await reactToPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('promoId is required');
  });

  it('returns 400 when body is missing', async () => {
    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'p1' }, body: null }),
      'Wrestler',
    );
    const result = await reactToPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
  });

  it('returns 400 when reaction type is invalid', async () => {
    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'p1' }, body: JSON.stringify({ reaction: 'love' }) }),
      'Wrestler',
    );
    const result = await reactToPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toContain('Valid reaction is required');
  });

  it('returns 400 when reaction is missing from body', async () => {
    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'p1' }, body: JSON.stringify({}) }),
      'Wrestler',
    );
    const result = await reactToPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toContain('Valid reaction is required');
  });

  it('returns 404 when promo does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'missing' }, body: JSON.stringify({ reaction: 'fire' }) }),
      'Wrestler',
    );
    const result = await reactToPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(404);
    expect(body(result).message).toBe('Promo not found');
  });

  it('adds a new reaction when user has no existing reaction', async () => {
    mockGet.mockResolvedValue({
      Item: {
        promoId: 'p1', reactions: {},
        reactionCounts: { fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 },
      },
    });
    mockUpdate.mockResolvedValue({});

    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'p1' }, body: JSON.stringify({ reaction: 'fire' }) }),
      'Wrestler',
    );
    const result = await reactToPromo(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data.reactions['user-sub-1']).toBe('fire');
    expect(data.reactionCounts.fire).toBe(1);
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it('toggles off the reaction when user sends the same reaction again', async () => {
    mockGet.mockResolvedValue({
      Item: {
        promoId: 'p1', reactions: { 'user-sub-1': 'fire' },
        reactionCounts: { fire: 1, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 },
      },
    });
    mockUpdate.mockResolvedValue({});

    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'p1' }, body: JSON.stringify({ reaction: 'fire' }) }),
      'Wrestler',
    );
    const result = await reactToPromo(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data.reactions['user-sub-1']).toBeUndefined();
    expect(data.reactionCounts.fire).toBe(0);
  });

  it('switches reaction when user sends a different reaction type', async () => {
    mockGet.mockResolvedValue({
      Item: {
        promoId: 'p1', reactions: { 'user-sub-1': 'fire' },
        reactionCounts: { fire: 1, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 },
      },
    });
    mockUpdate.mockResolvedValue({});

    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'p1' }, body: JSON.stringify({ reaction: 'mic' }) }),
      'Wrestler',
    );
    const result = await reactToPromo(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data.reactions['user-sub-1']).toBe('mic');
    expect(data.reactionCounts.fire).toBe(0);
    expect(data.reactionCounts.mic).toBe(1);
  });

  it('does not allow reactionCounts to go below zero via Math.max', async () => {
    mockGet.mockResolvedValue({
      Item: {
        promoId: 'p1', reactions: { 'user-sub-1': 'fire' },
        reactionCounts: { fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 },
      },
    });
    mockUpdate.mockResolvedValue({});

    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'p1' }, body: JSON.stringify({ reaction: 'fire' }) }),
      'Wrestler',
    );
    const result = await reactToPromo(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(body(result).reactionCounts.fire).toBe(0);
  });

  it('accepts all five valid reaction types', async () => {
    const validReactions = ['fire', 'mic', 'trash', 'mind-blown', 'clap'];
    for (const reaction of validReactions) {
      vi.clearAllMocks();
      mockGet.mockResolvedValue({
        Item: {
          promoId: 'p1', reactions: {},
          reactionCounts: { fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 },
        },
      });
      mockUpdate.mockResolvedValue({});

      const event = withAuth(
        makeEvent({ pathParameters: { promoId: 'p1' }, body: JSON.stringify({ reaction }) }),
        'Wrestler',
      );
      const result = await reactToPromo(event, ctx, cb);
      expect(result!.statusCode).toBe(200);
      expect(body(result).reactions['user-sub-1']).toBe(reaction);
    }
  });

  it('handles promo with empty reactions gracefully', async () => {
    mockGet.mockResolvedValue({
      Item: { promoId: 'p1', reactions: {}, reactionCounts: { fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 } },
    });
    mockUpdate.mockResolvedValue({});

    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'p1' }, body: JSON.stringify({ reaction: 'clap' }) }),
      'Wrestler',
    );
    const result = await reactToPromo(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data.reactions['user-sub-1']).toBe('clap');
    expect(data.reactionCounts.clap).toBe(1);
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockGet.mockRejectedValue(new Error('DynamoDB failure'));
    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'p1' }, body: JSON.stringify({ reaction: 'fire' }) }),
      'Wrestler',
    );
    const result = await reactToPromo(event, ctx, cb);
    expect(result!.statusCode).toBe(500);
    expect(body(result).message).toBe('Failed to react to promo');
  });
});
