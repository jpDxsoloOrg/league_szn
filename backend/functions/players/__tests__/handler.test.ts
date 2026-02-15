import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const {
  mockGet,
  mockPut,
  mockScan,
  mockQuery,
  mockUpdate,
  mockDelete,
  mockScanAll,
  mockQueryAll,
} = vi.hoisted(() => ({
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
    PLAYERS: 'Players',
    DIVISIONS: 'Divisions',
    CHAMPIONSHIPS: 'Championships',
    SEASON_STANDINGS: 'SeasonStandings',
    SEASONS: 'Seasons',
  },
}));

vi.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

vi.mock('../../../lib/auth', () => ({
  requireRole: () => undefined,
  getAuthContext: () => ({ sub: 'user-sub-1', groups: ['Wrestler'], username: 'u', email: 'e@e.com' }),
  hasRole: () => true,
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
    resource: '',
    requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

describe('players router', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /players routes to getPlayers and returns 200', async () => {
    mockScan.mockResolvedValue({ Items: [{ playerId: 'p1', name: 'P1' }] });
    const event = makeEvent({ httpMethod: 'GET', path: '/dev/players', pathParameters: null });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toHaveLength(1);
  });

  it('GET /players/me routes to getMyProfile', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', name: 'Me', userId: 'sub-1' }] });
    mockScanAll.mockResolvedValue([{ seasonId: 's1', name: 'Season 1', status: 'active' }]);
    mockQueryAll.mockResolvedValue([]);
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/dev/players/me',
      pathParameters: {},
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).name).toBe('Me');
  });

  it('PUT /players/me routes to updateMyProfile', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'sub-1' }] });
    mockGet.mockResolvedValue({ Item: { playerId: 'p1' } });
    mockUpdate.mockResolvedValue({});
    const event = makeEvent({
      httpMethod: 'PUT',
      path: '/dev/players/me',
      pathParameters: {},
      body: JSON.stringify({ currentWrestler: 'Rock' }),
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
  });

  it('POST /players routes to createPlayer and returns 201', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/dev/players',
      pathParameters: null,
      body: JSON.stringify({ name: 'John', currentWrestler: 'Rock' }),
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(201);
    expect(JSON.parse(result!.body).playerId).toBe('test-uuid-1234');
  });

  it('PUT /players/{playerId} routes to updatePlayer', async () => {
    mockGet.mockResolvedValue({ Item: { playerId: 'p1', name: 'Old' } });
    mockUpdate.mockResolvedValue({});
    const event = makeEvent({
      httpMethod: 'PUT',
      path: '/dev/players/p1',
      pathParameters: { playerId: 'p1' },
      body: JSON.stringify({ name: 'New', currentWrestler: 'Rock' }),
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
  });

  it('DELETE /players/{playerId} routes to deletePlayer', async () => {
    mockGet.mockResolvedValue({ Item: { playerId: 'p1' } });
    mockScan.mockResolvedValue({ Items: [] });
    mockQuery.mockResolvedValue({ Items: [] });
    mockDelete.mockResolvedValue({});
    const event = makeEvent({
      httpMethod: 'DELETE',
      path: '/dev/players/p1',
      pathParameters: { playerId: 'p1' },
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(204);
  });

  it('returns 405 for unsupported method/path', async () => {
    const event = makeEvent({
      httpMethod: 'PATCH',
      path: '/dev/players',
      pathParameters: null,
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(405);
    expect(JSON.parse(result!.body).message).toBeDefined();
  });
});
