import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const {
  mockGet,
  mockPut,
  mockQuery,
  mockUpdate,
  mockDelete,
  mockScanAll,
  mockQueryAll,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
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
    query: mockQuery,
    update: mockUpdate,
    delete: mockDelete,
    scanAll: mockScanAll,
    queryAll: mockQueryAll,
  },
  TableNames: { PROMOS: 'Promos', PLAYERS: 'Players' },
}));

vi.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

vi.mock('../../../lib/auth', () => ({
  requireRole: () => undefined,
  getAuthContext: () => ({ sub: 'user-sub-1', groups: ['Wrestler'], username: 'u', email: 'e@e.com' }),
  hasRole: () => true,
}));

vi.mock('../../../lib/parseBody', () => ({
  parseBody: (event: { body: string | null }) => {
    if (!event.body) return { data: null, error: { statusCode: 400, body: JSON.stringify({ message: 'Bad' }) } };
    try {
      return { data: JSON.parse(event.body), error: undefined };
    } catch {
      return { data: null, error: { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON' }) } };
    }
  },
}));

import { handler } from '../handler';

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/promos',
    requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

describe('promos router', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /promos routes to getPromos and returns 200', async () => {
    mockScanAll.mockResolvedValue([{ promoId: 'pr1', playerId: 'p1', content: 'Hello world', promoType: 'open-mic' }]);
    mockGet.mockResolvedValue({ Item: { playerId: 'p1', name: 'John' } });
    const event = makeEvent({ httpMethod: 'GET', resource: '/promos', pathParameters: null });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toHaveLength(1);
  });

  it('GET /promos/{promoId} routes to getPromo', async () => {
    mockGet
      .mockResolvedValueOnce({
        Item: { promoId: 'pr1', playerId: 'p1', content: 'A'.repeat(50), promoType: 'open-mic' },
      })
      .mockResolvedValueOnce({ Item: { playerId: 'p1', name: 'John', currentWrestler: 'Cena' } });
    mockScanAll.mockResolvedValue([]);
    const event = makeEvent({
      httpMethod: 'GET',
      resource: '/promos/{promoId}',
      pathParameters: { promoId: 'pr1' },
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).promo.promoId).toBe('pr1');
  });

  it('POST /promos routes to createPromo and returns 201', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });
    mockPut.mockResolvedValue({});
    const event = makeEvent({
      httpMethod: 'POST',
      resource: '/promos',
      pathParameters: null,
      body: JSON.stringify({
        promoType: 'open-mic',
        title: 'Test',
        content: 'This is at least fifty characters long so validation passes.',
      }),
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(201);
    expect(JSON.parse(result!.body).promoId).toBe('test-uuid-1234');
  });

  it('POST /promos/{promoId}/react routes to reactToPromo', async () => {
    mockGet.mockResolvedValue({
      Item: { promoId: 'pr1', playerId: 'p1', content: 'A'.repeat(50), promoType: 'open-mic', reactions: {}, reactionCounts: { fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 } },
    });
    mockUpdate.mockResolvedValue({});
    const event = makeEvent({
      httpMethod: 'POST',
      resource: '/promos/{promoId}/react',
      pathParameters: { promoId: 'pr1' },
      body: JSON.stringify({ reaction: 'fire' }),
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
  });

  it('PUT /admin/promos/{promoId} routes to adminUpdatePromo', async () => {
    mockGet.mockResolvedValue({
      Item: { promoId: 'pr1', isPinned: false, isHidden: false },
    });
    mockUpdate.mockResolvedValue({});
    const event = makeEvent({
      httpMethod: 'PUT',
      resource: '/admin/promos/{promoId}',
      pathParameters: { promoId: 'pr1' },
      body: JSON.stringify({ isPinned: true }),
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
  });

  it('DELETE /admin/promos/{promoId} routes to deletePromo', async () => {
    mockGet.mockResolvedValue({ Item: { promoId: 'pr1' } });
    mockDelete.mockResolvedValue({});
    const event = makeEvent({
      httpMethod: 'DELETE',
      resource: '/admin/promos/{promoId}',
      pathParameters: { promoId: 'pr1' },
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(204);
  });

  it('POST /admin/promos/bulk-delete routes to bulkDeletePromos', async () => {
    mockScanAll.mockResolvedValue([]);
    const event = makeEvent({
      httpMethod: 'POST',
      resource: '/admin/promos/bulk-delete',
      pathParameters: null,
      body: JSON.stringify({ isHidden: true }),
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).deleted).toBeDefined();
  });

  it('returns 405 for unsupported method/path', async () => {
    const event = makeEvent({
      httpMethod: 'PATCH',
      resource: '/promos',
      pathParameters: null,
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(405);
  });
});
