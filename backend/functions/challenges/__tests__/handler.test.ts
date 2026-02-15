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
  TableNames: { CHALLENGES: 'Challenges', PLAYERS: 'Players' },
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

const p1 = { playerId: 'p1', name: 'John', currentWrestler: 'Cena' };
const p2 = { playerId: 'p2', name: 'Rock', currentWrestler: 'Rock' };

function mockPlayerLookup() {
  mockGet.mockImplementation(({ Key }: any) => {
    if (Key?.playerId === 'p1') return Promise.resolve({ Item: p1 });
    if (Key?.playerId === 'p2') return Promise.resolve({ Item: p2 });
    return Promise.resolve({ Item: undefined });
  });
}

describe('challenges router', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /challenges routes to getChallenges and returns 200', async () => {
    mockScanAll.mockResolvedValue([{ challengeId: 'ch1', challengerId: 'p1', challengedId: 'p2', status: 'pending' }]);
    mockPlayerLookup();
    const event = makeEvent({ httpMethod: 'GET', path: '/dev/challenges', pathParameters: null });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toHaveLength(1);
  });

  it('GET /challenges/{challengeId} routes to getChallenge', async () => {
    mockGet.mockImplementation((params: { Key?: { challengeId?: string; playerId?: string } }) => {
      if (params.Key?.challengeId) {
        return Promise.resolve({
          Item: { challengeId: 'ch1', challengerId: 'p1', challengedId: 'p2', status: 'pending' },
        });
      }
      if (params.Key?.playerId === 'p1') return Promise.resolve({ Item: p1 });
      if (params.Key?.playerId === 'p2') return Promise.resolve({ Item: p2 });
      return Promise.resolve({ Item: undefined });
    });
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/dev/challenges/ch1',
      pathParameters: { challengeId: 'ch1' },
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).challengeId).toBe('ch1');
  });

  it('POST /challenges routes to createChallenge and returns 201', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1' }] });
    mockGet.mockResolvedValue({ Item: { playerId: 'p2' } });
    mockPut.mockResolvedValue({});
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/dev/challenges',
      pathParameters: null,
      body: JSON.stringify({ challengerId: 'p1', challengedId: 'p2', matchType: 'Singles' }),
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(201);
    expect(JSON.parse(result!.body).challengeId).toBeDefined();
  });

  it('POST /challenges/{challengeId}/respond routes to respondToChallenge', async () => {
    mockGet.mockImplementation((params: { Key?: { challengeId?: string }; TableName?: string }) => {
      if (params.Key?.challengeId) {
        return Promise.resolve({
          Item: { challengeId: 'ch1', challengerId: 'p1', challengedId: 'p2', status: 'pending' },
        });
      }
      return Promise.resolve({ Item: undefined });
    });
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p2', userId: 'user-sub-1' }] });
    mockUpdate.mockResolvedValue({});
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/dev/challenges/ch1/respond',
      pathParameters: { challengeId: 'ch1' },
      body: JSON.stringify({ action: 'accept' }),
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
  });

  it('POST /challenges/{challengeId}/cancel routes to cancelChallenge', async () => {
    mockGet.mockResolvedValue({
      Item: { challengeId: 'ch1', status: 'pending' },
    });
    mockUpdate.mockResolvedValue({});
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/dev/challenges/ch1/cancel',
      pathParameters: { challengeId: 'ch1' },
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
  });

  it('DELETE /challenges/{challengeId} routes to deleteChallenge', async () => {
    mockGet.mockResolvedValue({ Item: { challengeId: 'ch1' } });
    mockDelete.mockResolvedValue({});
    const event = makeEvent({
      httpMethod: 'DELETE',
      path: '/dev/challenges/ch1',
      pathParameters: { challengeId: 'ch1' },
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(204);
  });

  it('POST /challenges/bulk-delete routes to bulkDeleteChallenges', async () => {
    mockQueryAll.mockResolvedValue([]);
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/dev/challenges/bulk-delete',
      pathParameters: null,
      body: JSON.stringify({ statuses: ['cancelled', 'expired'] }),
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
  });

  it('returns 405 for unsupported method/path', async () => {
    const event = makeEvent({
      httpMethod: 'PATCH',
      path: '/dev/challenges',
      pathParameters: null,
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(405);
  });
});
