import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Hoisted mocks ──────────────────────────────────────────────────

const { mockGet, mockScanAll } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockScanAll: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet, put: vi.fn(), update: vi.fn(), query: vi.fn(),
    scan: vi.fn(), delete: vi.fn(), scanAll: mockScanAll, queryAll: vi.fn(),
  },
  TableNames: { PROMOS: 'Promos', PLAYERS: 'Players' },
}));

import { handler as getPromo } from '../getPromo';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {},
    httpMethod: 'GET', isBase64Encoded: false, path: '/',
    pathParameters: null, queryStringParameters: null,
    multiValueQueryStringParameters: null, stageVariables: null,
    resource: '', requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

const body = (r: any) => JSON.parse(r!.body);

// ─── getPromo ────────────────────────────────────────────────────────

describe('getPromo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when promoId is missing from path', async () => {
    const result = await getPromo(makeEvent({ pathParameters: null }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(body(result).message).toBe('promoId is required');
  });

  it('returns 404 when promo does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    const result = await getPromo(makeEvent({ pathParameters: { promoId: 'missing' } }), ctx, cb);
    expect(result!.statusCode).toBe(404);
    expect(body(result).message).toBe('Promo not found');
  });

  it('returns enriched promo with player info and response list', async () => {
    const promo = {
      promoId: 'p1', playerId: 'pl1', promoType: 'open-mic',
      content: 'My promo content', isHidden: false, isPinned: false,
      createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const responsePromo = {
      promoId: 'p2', playerId: 'pl2', targetPromoId: 'p1',
      promoType: 'response', content: 'My response', isHidden: false,
      createdAt: '2024-01-02T00:00:00Z',
    };

    mockGet.mockImplementation(async (params: any) => {
      if (params.Key.promoId) return { Item: promo };
      if (params.Key.playerId === 'pl1') return { Item: { playerId: 'pl1', name: 'John', currentWrestler: 'The Rock', imageUrl: 'img1.jpg' } };
      if (params.Key.playerId === 'pl2') return { Item: { playerId: 'pl2', name: 'Jane', currentWrestler: 'Bianca', imageUrl: 'img2.jpg' } };
      return { Item: undefined };
    });
    mockScanAll.mockResolvedValue([promo, responsePromo]);

    const result = await getPromo(makeEvent({ pathParameters: { promoId: 'p1' } }), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data.promo.promoId).toBe('p1');
    expect(data.promo.playerName).toBe('John');
    expect(data.promo.wrestlerName).toBe('The Rock');
    expect(data.promo.playerImageUrl).toBe('img1.jpg');
    expect(data.promo.responseCount).toBe(1);
    expect(data.responses).toHaveLength(1);
    expect(data.responses[0].playerName).toBe('Jane');
    expect(data.responses[0].wrestlerName).toBe('Bianca');
  });

  it('shows "Unknown" when the promo author player has been deleted', async () => {
    const promo = {
      promoId: 'p1', playerId: 'deleted-pl', promoType: 'open-mic',
      content: 'test', isHidden: false, createdAt: '2024-01-01T00:00:00Z',
    };
    mockGet.mockImplementation(async (params: any) => {
      if (params.Key.promoId) return { Item: promo };
      return { Item: undefined };
    });
    mockScanAll.mockResolvedValue([promo]);

    const result = await getPromo(makeEvent({ pathParameters: { promoId: 'p1' } }), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data.promo.playerName).toBe('Unknown');
    expect(data.promo.wrestlerName).toBe('Unknown');
  });

  it('filters hidden response promos from the responses list', async () => {
    const promo = {
      promoId: 'p1', playerId: 'pl1', promoType: 'open-mic',
      content: 'main', isHidden: false, createdAt: '2024-01-01T00:00:00Z',
    };
    const visible = {
      promoId: 'p2', playerId: 'pl1', targetPromoId: 'p1',
      isHidden: false, createdAt: '2024-01-02T00:00:00Z',
    };
    const hidden = {
      promoId: 'p3', playerId: 'pl1', targetPromoId: 'p1',
      isHidden: true, createdAt: '2024-01-03T00:00:00Z',
    };

    mockGet.mockImplementation(async (params: any) => {
      if (params.Key.promoId) return { Item: promo };
      return { Item: { playerId: 'pl1', name: 'John', currentWrestler: 'The Rock' } };
    });
    mockScanAll.mockResolvedValue([promo, visible, hidden]);

    const result = await getPromo(makeEvent({ pathParameters: { promoId: 'p1' } }), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data.responses).toHaveLength(1);
    expect(data.responses[0].promoId).toBe('p2');
  });

  it('includes targetPromo summary when promo is a response to another promo', async () => {
    const parent = {
      promoId: 'parent-1', playerId: 'pl1', promoType: 'open-mic',
      title: 'Parent Title', content: 'Parent content', isHidden: false, isPinned: true,
      createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const resp = {
      promoId: 'resp-1', playerId: 'pl2', targetPromoId: 'parent-1',
      promoType: 'response', content: 'My response', isHidden: false,
      createdAt: '2024-01-02T00:00:00Z',
    };

    mockGet.mockImplementation(async (params: any) => {
      if (params.Key.promoId) return { Item: resp };
      if (params.Key.playerId === 'pl1') return { Item: { playerId: 'pl1', name: 'John', currentWrestler: 'The Rock' } };
      if (params.Key.playerId === 'pl2') return { Item: { playerId: 'pl2', name: 'Jane', currentWrestler: 'Bianca' } };
      return { Item: undefined };
    });
    mockScanAll.mockResolvedValue([parent, resp]);

    const result = await getPromo(makeEvent({ pathParameters: { promoId: 'resp-1' } }), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data.promo.targetPromo).toBeDefined();
    expect(data.promo.targetPromo.promoId).toBe('parent-1');
    expect(data.promo.targetPromo.content).toBe('');
    expect(data.promo.targetPromo.isPinned).toBe(true);
  });

  it('sorts responses by createdAt ascending', async () => {
    const promo = {
      promoId: 'p1', playerId: 'pl1', promoType: 'open-mic',
      content: 'main', isHidden: false, createdAt: '2024-01-01T00:00:00Z',
    };
    const r1 = { promoId: 'r1', playerId: 'pl1', targetPromoId: 'p1', isHidden: false, createdAt: '2024-01-03T00:00:00Z' };
    const r2 = { promoId: 'r2', playerId: 'pl1', targetPromoId: 'p1', isHidden: false, createdAt: '2024-01-02T00:00:00Z' };

    mockGet.mockImplementation(async (params: any) => {
      if (params.Key.promoId) return { Item: promo };
      return { Item: { playerId: 'pl1', name: 'John', currentWrestler: 'The Rock' } };
    });
    mockScanAll.mockResolvedValue([promo, r1, r2]);

    const result = await getPromo(makeEvent({ pathParameters: { promoId: 'p1' } }), ctx, cb);

    const data = body(result);
    expect(data.responses[0].promoId).toBe('r2'); // earlier date first
    expect(data.responses[1].promoId).toBe('r1');
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockGet.mockRejectedValue(new Error('DynamoDB failure'));
    const result = await getPromo(makeEvent({ pathParameters: { promoId: 'p1' } }), ctx, cb);
    expect(result!.statusCode).toBe(500);
    expect(body(result).message).toBe('Failed to fetch promo');
  });
});
