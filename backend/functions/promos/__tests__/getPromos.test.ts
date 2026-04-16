import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Hoisted mocks ──────────────────────────────────────────────────

const { mockGet, mockScanAll, mockQueryAll } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockScanAll: vi.fn(),
  mockQueryAll: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet, put: vi.fn(), update: vi.fn(), query: vi.fn(),
    scan: vi.fn(), delete: vi.fn(), scanAll: mockScanAll, queryAll: mockQueryAll,
  },
  TableNames: { PROMOS: 'Promos', PLAYERS: 'Players' },
}));

import { handler as getPromos } from '../getPromos';

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

// ─── getPromos ───────────────────────────────────────────────────────

describe('getPromos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all non-hidden promos via scan when no filters are provided', async () => {
    mockScanAll.mockResolvedValue([
      { promoId: 'p1', playerId: 'pl1', promoType: 'open-mic', isHidden: false, createdAt: '2024-01-02T00:00:00Z' },
      { promoId: 'p2', playerId: 'pl1', promoType: 'call-out', isHidden: false, createdAt: '2024-01-01T00:00:00Z' },
    ]);
    mockGet.mockResolvedValue({
      Item: { playerId: 'pl1', name: 'John', currentWrestler: 'The Rock', imageUrl: 'img.jpg' },
    });

    const result = await getPromos(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data).toHaveLength(2);
    expect(data[0].promoId).toBe('p1'); // sorted desc by createdAt
    expect(data[0].playerName).toBe('John');
    expect(data[0].wrestlerName).toBe('The Rock');
    expect(data[0].playerImageUrl).toBe('img.jpg');
  });

  it('filters by playerId when playerId query param is provided', async () => {
    mockQueryAll.mockResolvedValue([
      { promoId: 'p1', playerId: 'pl1', isHidden: false, createdAt: '2024-01-01T00:00:00Z' },
    ]);
    mockGet.mockResolvedValue({
      Item: { playerId: 'pl1', name: 'John', currentWrestler: 'The Rock' },
    });

    const event = makeEvent({ queryStringParameters: { playerId: 'pl1' } });
    const result = await getPromos(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockQueryAll).toHaveBeenCalledOnce();
    expect(body(result)).toHaveLength(1);
  });

  it('filters by promoType when promoType query param is provided', async () => {
    mockQueryAll.mockResolvedValue([
      { promoId: 'p1', playerId: 'pl1', promoType: 'call-out', isHidden: false, createdAt: '2024-01-01T00:00:00Z' },
    ]);
    mockGet.mockResolvedValue({
      Item: { playerId: 'pl1', name: 'John', currentWrestler: 'The Rock' },
    });

    const event = makeEvent({ queryStringParameters: { promoType: 'call-out' } });
    const result = await getPromos(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockQueryAll).toHaveBeenCalledOnce();
    expect(body(result)[0].promoType).toBe('call-out');
  });

  it('excludes hidden promos from the result', async () => {
    mockScanAll.mockResolvedValue([
      { promoId: 'p1', playerId: 'pl1', isHidden: false, createdAt: '2024-01-01T00:00:00Z' },
      { promoId: 'p2', playerId: 'pl1', isHidden: true, createdAt: '2024-01-02T00:00:00Z' },
    ]);
    mockGet.mockResolvedValue({
      Item: { playerId: 'pl1', name: 'John', currentWrestler: 'The Rock' },
    });

    const result = await getPromos(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data).toHaveLength(1);
    expect(data[0].promoId).toBe('p1');
  });

  it('enriches with target player details when targetPlayerId is set', async () => {
    mockScanAll.mockResolvedValue([
      { promoId: 'p1', playerId: 'pl1', targetPlayerId: 'pl2', isHidden: false, createdAt: '2024-01-01T00:00:00Z' },
    ]);
    mockGet
      .mockResolvedValueOnce({ Item: { playerId: 'pl1', name: 'John', currentWrestler: 'The Rock' } })
      .mockResolvedValueOnce({ Item: { playerId: 'pl2', name: 'Jane', currentWrestler: 'Bianca' } });

    const result = await getPromos(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data[0].targetPlayerName).toBe('Jane');
    expect(data[0].targetWrestlerName).toBe('Bianca');
  });

  it('shows "Unknown" for player name when player has been deleted', async () => {
    mockScanAll.mockResolvedValue([
      { promoId: 'p1', playerId: 'deleted-player', isHidden: false, createdAt: '2024-01-01T00:00:00Z' },
    ]);
    mockGet.mockResolvedValue({ Item: undefined });

    const result = await getPromos(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data[0].playerName).toBe('Unknown');
    expect(data[0].wrestlerName).toBe('Unknown');
  });

  it('counts responses for target promos via responseCount', async () => {
    mockScanAll.mockResolvedValue([
      { promoId: 'p1', playerId: 'pl1', isHidden: false, createdAt: '2024-01-01T00:00:00Z' },
      { promoId: 'p2', playerId: 'pl1', targetPromoId: 'p1', isHidden: false, createdAt: '2024-01-02T00:00:00Z' },
      { promoId: 'p3', playerId: 'pl1', targetPromoId: 'p1', isHidden: false, createdAt: '2024-01-03T00:00:00Z' },
    ]);
    mockGet.mockResolvedValue({
      Item: { playerId: 'pl1', name: 'John', currentWrestler: 'The Rock' },
    });

    const result = await getPromos(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const parent = body(result).find((p: any) => p.promoId === 'p1');
    expect(parent.responseCount).toBe(2);
  });

  it('enriches response promos with targetPromo summary (content stripped)', async () => {
    mockScanAll.mockResolvedValue([
      { promoId: 'p1', playerId: 'pl1', promoType: 'open-mic', title: 'Original', content: 'Long content', isHidden: false, isPinned: false, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      { promoId: 'p2', playerId: 'pl1', promoType: 'response', targetPromoId: 'p1', isHidden: false, createdAt: '2024-01-02T00:00:00Z' },
    ]);
    mockGet.mockResolvedValue({
      Item: { playerId: 'pl1', name: 'John', currentWrestler: 'The Rock' },
    });

    const result = await getPromos(makeEvent(), ctx, cb);
    const responsePromo = body(result).find((p: any) => p.promoId === 'p2');

    expect(responsePromo.targetPromo).toBeDefined();
    expect(responsePromo.targetPromo.promoId).toBe('p1');
    expect(responsePromo.targetPromo.content).toBe('');
  });

  it('excludes response promos when excludeResponses=true is set', async () => {
    mockScanAll.mockResolvedValue([
      { promoId: 'p1', playerId: 'pl1', promoType: 'open-mic', isHidden: false, createdAt: '2024-01-01T00:00:00Z' },
      { promoId: 'p2', playerId: 'pl1', promoType: 'response', targetPromoId: 'p1', isHidden: false, createdAt: '2024-01-02T00:00:00Z' },
    ]);
    mockGet.mockResolvedValue({
      Item: { playerId: 'pl1', name: 'John', currentWrestler: 'The Rock' },
    });

    const event = makeEvent({ queryStringParameters: { excludeResponses: 'true' } });
    const result = await getPromos(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data).toHaveLength(1);
    expect(data.find((p: any) => p.promoId === 'p2')).toBeUndefined();
    const parent = data.find((p: any) => p.promoId === 'p1');
    expect(parent.responseCount).toBe(1);
  });

  it('excludes orphan response promos (promoType=response with no targetPromoId) when excludeResponses=true', async () => {
    mockScanAll.mockResolvedValue([
      { promoId: 'p1', playerId: 'pl1', promoType: 'open-mic', isHidden: false, createdAt: '2024-01-01T00:00:00Z' },
      { promoId: 'orphan', playerId: 'pl1', promoType: 'response', isHidden: false, createdAt: '2024-01-03T00:00:00Z' },
    ]);
    mockGet.mockResolvedValue({
      Item: { playerId: 'pl1', name: 'John', currentWrestler: 'The Rock' },
    });

    const event = makeEvent({ queryStringParameters: { excludeResponses: 'true' } });
    const result = await getPromos(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data).toHaveLength(1);
    expect(data.find((p: any) => p.promoId === 'orphan')).toBeUndefined();
  });

  it('includes response promos by default (no excludeResponses param)', async () => {
    mockScanAll.mockResolvedValue([
      { promoId: 'p1', playerId: 'pl1', promoType: 'open-mic', isHidden: false, createdAt: '2024-01-01T00:00:00Z' },
      { promoId: 'p2', playerId: 'pl1', promoType: 'response', targetPromoId: 'p1', isHidden: false, createdAt: '2024-01-02T00:00:00Z' },
    ]);
    mockGet.mockResolvedValue({
      Item: { playerId: 'pl1', name: 'John', currentWrestler: 'The Rock' },
    });

    const result = await getPromos(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const data = body(result);
    expect(data).toHaveLength(2);
    expect(data.find((p: any) => p.promoId === 'p2')).toBeDefined();
  });

  it('returns 500 when scanAll throws an error', async () => {
    mockScanAll.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await getPromos(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(body(result).message).toBe('Failed to fetch promos');
  });
});
