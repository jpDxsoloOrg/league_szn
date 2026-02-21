import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const {
  mockGet,
  mockPut,
  mockScan,
  mockQuery,
  mockUpdate,
  mockDelete,
  mockTransactWrite,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockScan: vi.fn(),
  mockQuery: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockTransactWrite: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet,
    put: mockPut,
    scan: mockScan,
    query: mockQuery,
    update: mockUpdate,
    delete: mockDelete,
    transactWrite: mockTransactWrite,
  },
  TableNames: {
    CHAMPIONSHIPS: 'Championships',
    CHAMPIONSHIP_HISTORY: 'ChampionshipHistory',
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
    requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

describe('championships router', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /championships routes to getChampionships and returns 200', async () => {
    mockScan.mockResolvedValue({ Items: [{ championshipId: 'c1', name: 'World' }] });
    const event = makeEvent({ httpMethod: 'GET', resource: '/championships', pathParameters: null });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toHaveLength(1);
  });

  it('POST /championships routes to createChampionship and returns 201', async () => {
    mockPut.mockResolvedValue({});
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
    mockQuery.mockResolvedValue({ Items: [{ championshipId: 'c1', wonDate: '2025-01-01' }] });
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
    mockGet
      .mockResolvedValueOnce({ Item: { championshipId: 'c1', currentChampionId: 'p1', currentChampion: 'p1' } })
      .mockResolvedValueOnce({ Item: { championshipId: 'c1', currentChampionId: null, currentChampion: null } });
    mockQuery.mockResolvedValue({ Items: [{ championshipId: 'c1', wonDate: '2025-01-01', playerId: 'p1' }] });
    mockTransactWrite.mockResolvedValue({});
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
    mockGet.mockResolvedValue({ Item: { championshipId: 'c1', name: 'World' } });
    mockUpdate.mockResolvedValue({});
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
    mockGet.mockResolvedValue({ Item: { championshipId: 'c1' } });
    mockQuery.mockResolvedValue({ Items: [] });
    mockDelete.mockResolvedValue({});
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
