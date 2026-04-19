import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const {
  mockChampionshipsList,
  mockChampionshipsFindById,
  mockChampionshipsCreate,
  mockChampionshipsUpdate,
  mockChampionshipsDelete,
  mockChampionshipsListHistory,
  mockChampionshipsDeleteHistoryEntry,
  mockChampionshipsFindCurrentReign,
  mockRunInTransaction,
} = vi.hoisted(() => ({
  mockChampionshipsList: vi.fn(),
  mockChampionshipsFindById: vi.fn(),
  mockChampionshipsCreate: vi.fn(),
  mockChampionshipsUpdate: vi.fn(),
  mockChampionshipsDelete: vi.fn(),
  mockChampionshipsListHistory: vi.fn(),
  mockChampionshipsDeleteHistoryEntry: vi.fn(),
  mockChampionshipsFindCurrentReign: vi.fn(),
  mockRunInTransaction: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    competition: {
      championships: {
        list: mockChampionshipsList,
        findById: mockChampionshipsFindById,
        create: mockChampionshipsCreate,
        update: mockChampionshipsUpdate,
        delete: mockChampionshipsDelete,
        listHistory: mockChampionshipsListHistory,
        deleteHistoryEntry: mockChampionshipsDeleteHistoryEntry,
        findCurrentReign: mockChampionshipsFindCurrentReign,
      },
    },
    runInTransaction: mockRunInTransaction,
  }),
  NotFoundError: class NotFoundError extends Error {
    constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
  },
}));

vi.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

vi.mock('../../../lib/auth', () => ({
  requireRole: () => undefined,
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
    resource: '/championships',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

describe('championships router', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /championships routes to getChampionships and returns 200', async () => {
    mockChampionshipsList.mockResolvedValue([{ championshipId: 'c1', name: 'World', isActive: true }]);
    const event = makeEvent({ httpMethod: 'GET', resource: '/championships', pathParameters: null });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toHaveLength(1);
  });

  it('POST /championships routes to createChampionship and returns 201', async () => {
    mockChampionshipsCreate.mockResolvedValue({
      championshipId: 'test-uuid-1234',
      name: 'World',
      type: 'singles',
      divisionId: 'div-1',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    });
    const event = makeEvent({
      httpMethod: 'POST',
      resource: '/championships',
      pathParameters: null,
      body: JSON.stringify({ name: 'World', type: 'singles', divisionId: 'div-1' }),
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(201);
    expect(JSON.parse(result!.body).championshipId).toBe('test-uuid-1234');
  });

  it('GET /championships/{id}/history routes to getChampionshipHistory', async () => {
    mockChampionshipsListHistory.mockResolvedValue([{ championshipId: 'c1', wonDate: '2025-01-01' }]);
    const event = makeEvent({
      httpMethod: 'GET',
      resource: '/championships/{championshipId}/history',
      pathParameters: { championshipId: 'c1' },
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toHaveLength(1);
  });

  it('POST /championships/{id}/vacate routes to vacateChampionship', async () => {
    mockChampionshipsFindById
      .mockResolvedValueOnce({ championshipId: 'c1', currentChampionId: 'p1', currentChampion: 'p1' })
      .mockResolvedValueOnce({ championshipId: 'c1', currentChampionId: null, currentChampion: null });
    mockChampionshipsFindCurrentReign.mockResolvedValue({ championshipId: 'c1', wonDate: '2025-01-01', playerId: 'p1' });
    mockRunInTransaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<void>) => {
      await fn({
        removeChampion: vi.fn(),
        closeReign: vi.fn(),
      });
    });
    const event = makeEvent({
      httpMethod: 'POST',
      resource: '/championships/{championshipId}/vacate',
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ reason: 'Injury' }),
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
  });

  it('PUT /championships/{id} routes to updateChampionship', async () => {
    mockChampionshipsUpdate.mockResolvedValue({ championshipId: 'c1', name: 'World Heavyweight' });
    const event = makeEvent({
      httpMethod: 'PUT',
      resource: '/championships/{championshipId}',
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ name: 'World Heavyweight' }),
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
  });

  it('DELETE /championships/{id} routes to deleteChampionship and returns 204', async () => {
    mockChampionshipsFindById.mockResolvedValue({ championshipId: 'c1' });
    mockChampionshipsDelete.mockResolvedValue(undefined);
    mockChampionshipsListHistory.mockResolvedValue([]);
    const event = makeEvent({
      httpMethod: 'DELETE',
      resource: '/championships/{championshipId}',
      pathParameters: { championshipId: 'c1' },
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(204);
  });

  it('returns 405 for unsupported method/path', async () => {
    const event = makeEvent({
      httpMethod: 'PATCH',
      resource: '/championships',
      pathParameters: null,
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(405);
  });
});
