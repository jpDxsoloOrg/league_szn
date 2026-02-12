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

import { handler as adminUpdatePromo } from '../adminUpdatePromo';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {},
    httpMethod: 'PATCH', isBase64Encoded: false, path: '/',
    pathParameters: null, queryStringParameters: null,
    multiValueQueryStringParameters: null, stageVariables: null,
    resource: '', requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

function withAuth(event: APIGatewayProxyEvent, groups: string, sub = 'admin-sub'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'adminuser', email: 'admin@test.com', principalId: sub },
    } as any,
  };
}

const body = (r: any) => JSON.parse(r!.body);

// ─── adminUpdatePromo ────────────────────────────────────────────────

describe('adminUpdatePromo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when caller is not Admin or Moderator', async () => {
    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'promo-1' }, body: JSON.stringify({ isPinned: true }) }),
      'Wrestler',
    );
    const result = await adminUpdatePromo(event, ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('returns 400 when promoId is missing from path', async () => {
    const event = withAuth(
      makeEvent({ pathParameters: null, body: JSON.stringify({ isPinned: true }) }),
      'Admin',
    );
    const result = await adminUpdatePromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('promoId is required');
  });

  it('returns 400 when body is missing', async () => {
    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'promo-1' }, body: null }),
      'Admin',
    );
    const result = await adminUpdatePromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('Request body is required');
  });

  it('returns 400 for invalid JSON body', async () => {
    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'promo-1' }, body: '{bad' }),
      'Admin',
    );
    const result = await adminUpdatePromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('Invalid JSON in request body');
  });

  it('returns 404 when promo does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'missing' }, body: JSON.stringify({ isPinned: true }) }),
      'Admin',
    );
    const result = await adminUpdatePromo(event, ctx, cb);
    expect(result!.statusCode).toBe(404);
    expect(body(result).message).toBe('Promo not found');
  });

  it('updates isPinned flag and returns updated promo', async () => {
    const existing = { promoId: 'promo-1', isPinned: false, isHidden: false, content: 'test' };
    mockGet.mockResolvedValue({ Item: existing });
    mockUpdate.mockResolvedValue({});

    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'promo-1' }, body: JSON.stringify({ isPinned: true }) }),
      'Admin',
    );
    const result = await adminUpdatePromo(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data.isPinned).toBe(true);
    expect(data.updatedAt).toBeDefined();
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it('updates isHidden flag and returns updated promo', async () => {
    mockGet.mockResolvedValue({ Item: { promoId: 'promo-1', isPinned: false, isHidden: false } });
    mockUpdate.mockResolvedValue({});

    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'promo-1' }, body: JSON.stringify({ isHidden: true }) }),
      'Admin',
    );
    const result = await adminUpdatePromo(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(body(result).isHidden).toBe(true);
  });

  it('updates both isPinned and isHidden in a single call', async () => {
    mockGet.mockResolvedValue({ Item: { promoId: 'promo-1', isPinned: false, isHidden: false } });
    mockUpdate.mockResolvedValue({});

    const event = withAuth(
      makeEvent({
        pathParameters: { promoId: 'promo-1' },
        body: JSON.stringify({ isPinned: true, isHidden: true }),
      }),
      'Admin',
    );
    const result = await adminUpdatePromo(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data.isPinned).toBe(true);
    expect(data.isHidden).toBe(true);
  });

  it('allows Moderator to update promos', async () => {
    mockGet.mockResolvedValue({ Item: { promoId: 'promo-1', isPinned: false, isHidden: false } });
    mockUpdate.mockResolvedValue({});

    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'promo-1' }, body: JSON.stringify({ isPinned: true }) }),
      'Moderator',
    );
    const result = await adminUpdatePromo(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
  });

  it('returns 500 when dynamodb throws an error', async () => {
    mockGet.mockRejectedValue(new Error('DynamoDB failure'));
    const event = withAuth(
      makeEvent({ pathParameters: { promoId: 'promo-1' }, body: JSON.stringify({ isPinned: true }) }),
      'Admin',
    );
    const result = await adminUpdatePromo(event, ctx, cb);
    expect(result!.statusCode).toBe(500);
    expect(body(result).message).toBe('Failed to update promo');
  });
});
