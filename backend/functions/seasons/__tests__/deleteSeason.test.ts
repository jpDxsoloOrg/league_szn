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
    SEASONS: 'Seasons',
    SEASON_STANDINGS: 'SeasonStandings',
  },
}));

import { handler as deleteSeason } from '../deleteSeason';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'DELETE',
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

// ─── deleteSeason ────────────────────────────────────────────────────

describe('deleteSeason', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes season and returns 204', async () => {
    mockGet.mockResolvedValue({ Item: { seasonId: 's1', name: 'Season 1' } });
    mockDelete.mockResolvedValue({});
    mockQuery.mockResolvedValue({ Items: [] });

    const event = makeEvent({ pathParameters: { seasonId: 's1' } });

    const result = await deleteSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('cascades delete to all season standings', async () => {
    mockGet.mockResolvedValue({ Item: { seasonId: 's1' } });
    mockDelete.mockResolvedValue({});
    mockQuery.mockResolvedValue({
      Items: [
        { seasonId: 's1', playerId: 'p1' },
        { seasonId: 's1', playerId: 'p2' },
        { seasonId: 's1', playerId: 'p3' },
      ],
    });

    const event = makeEvent({ pathParameters: { seasonId: 's1' } });

    const result = await deleteSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    // 1 season delete + 3 standings deletes = 4 total
    expect(mockDelete).toHaveBeenCalledTimes(4);
    // Verify standings deletes use correct composite key
    expect(mockDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: { seasonId: 's1', playerId: 'p1' },
      }),
    );
    expect(mockDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: { seasonId: 's1', playerId: 'p2' },
      }),
    );
    expect(mockDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: { seasonId: 's1', playerId: 'p3' },
      }),
    );
  });

  it('returns 400 when seasonId is missing from path', async () => {
    const event = makeEvent({ pathParameters: null });

    const result = await deleteSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Season ID is required');
  });

  it('returns 404 when season does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });

    const event = makeEvent({ pathParameters: { seasonId: 'missing' } });

    const result = await deleteSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Season not found');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('handles standings query returning undefined Items', async () => {
    mockGet.mockResolvedValue({ Item: { seasonId: 's1' } });
    mockDelete.mockResolvedValue({});
    mockQuery.mockResolvedValue({ Items: undefined });

    const event = makeEvent({ pathParameters: { seasonId: 's1' } });

    const result = await deleteSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    // Only the season itself is deleted
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when DynamoDB throws', async () => {
    mockGet.mockRejectedValue(new Error('DynamoDB failure'));

    const event = makeEvent({ pathParameters: { seasonId: 's1' } });

    const result = await deleteSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to delete season');
  });
});
