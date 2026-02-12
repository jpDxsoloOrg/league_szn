import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Mocks ----------------------------------------------------------------

const { mockGet, mockPut, mockScanAll } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockScanAll: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet,
    put: mockPut,
    scan: vi.fn(),
    query: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    scanAll: mockScanAll,
    queryAll: vi.fn(),
  },
  TableNames: {
    EVENTS: 'Events',
    FANTASY_CONFIG: 'FantasyConfig',
    FANTASY_PICKS: 'FantasyPicks',
    PLAYERS: 'Players',
    WRESTLER_COSTS: 'WrestlerCosts',
  },
}));

import { handler } from '../submitPicks';

// ---- Helpers ---------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};

const base: APIGatewayProxyEvent = {
  body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'POST',
  isBase64Encoded: false, path: '/', pathParameters: null,
  queryStringParameters: null, multiValueQueryStringParameters: null,
  stageVariables: null, resource: '', requestContext: { authorizer: {} } as any,
};
const makeEvent = (o: Partial<APIGatewayProxyEvent> = {}) => ({ ...base, ...o }) as APIGatewayProxyEvent;

const withAuth = (ev: APIGatewayProxyEvent, groups = 'Fantasy', sub = 'user-1') => ({
  ...ev, requestContext: { ...ev.requestContext,
    authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: sub },
  } as any,
}) as APIGatewayProxyEvent;

function setupValidPicks() {
  mockGet.mockResolvedValueOnce({ Item: { eventId: 'e1', status: 'scheduled' } }); // event
  mockGet.mockResolvedValueOnce({ Item: { defaultBudget: 500, defaultPicksPerDivision: 2 } }); // config
  mockScanAll.mockResolvedValueOnce([{ playerId: 'p1', name: 'Rock', divisionId: 'd1' }, { playerId: 'p2', name: 'Cena', divisionId: 'd1' }]); // players
  mockScanAll.mockResolvedValueOnce([{ playerId: 'p1', currentCost: 100 }, { playerId: 'p2', currentCost: 150 }]); // costs
  mockGet.mockResolvedValueOnce({ Item: undefined }); // existing picks
  mockPut.mockResolvedValueOnce({});
}

// ---- Tests -----------------------------------------------------------------

describe('submitPicks', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 403 when user lacks Fantasy role', async () => {
    const event = withAuth(
      makeEvent({ pathParameters: { eventId: 'e1' }, body: '{}' }),
      '', // no groups
    );
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('returns 400 when eventId is missing', async () => {
    const event = withAuth(makeEvent({ pathParameters: null, body: '{}' }));
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Event ID is required');
  });

  it('returns 400 when body is null', async () => {
    const event = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: null }));
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 for invalid JSON body', async () => {
    const event = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: 'not-json' }));
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 400 when picks is not an object', async () => {
    mockGet.mockResolvedValueOnce({ Item: { eventId: 'e1', status: 'scheduled' } });
    mockGet.mockResolvedValueOnce({ Item: {} });
    mockScanAll.mockResolvedValueOnce([]);
    mockScanAll.mockResolvedValueOnce([]);
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: 'bad' }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('picks must be an object');
  });

  it('returns 404 when event does not exist', async () => {
    mockGet.mockResolvedValueOnce({ Item: undefined });
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: {} }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(404);
  });

  it('returns 400 when event is completed', async () => {
    mockGet.mockResolvedValueOnce({ Item: { eventId: 'e1', status: 'completed' } });
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: {} }) }));
    expect((await handler(ev, ctx, cb))!.statusCode).toBe(400);
  });

  it('returns 400 when event is cancelled', async () => {
    mockGet.mockResolvedValueOnce({ Item: { eventId: 'e1', status: 'cancelled' } });
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: {} }) }));
    expect((await handler(ev, ctx, cb))!.statusCode).toBe(400);
  });

  it('returns 400 when event is fantasy-locked', async () => {
    mockGet.mockResolvedValueOnce({ Item: { eventId: 'e1', status: 'scheduled', fantasyLocked: true } });
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: {} }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Picks are locked for this event');
  });

  it('returns 400 when too many picks for a division', async () => {
    mockGet.mockResolvedValueOnce({ Item: { eventId: 'e1', status: 'scheduled' } });
    mockGet.mockResolvedValueOnce({ Item: { defaultBudget: 500, defaultPicksPerDivision: 1 } });
    mockScanAll.mockResolvedValueOnce([{ playerId: 'p1', name: 'A', divisionId: 'd1' }, { playerId: 'p2', name: 'B', divisionId: 'd1' }]);
    mockScanAll.mockResolvedValueOnce([]);
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: ['p1', 'p2'] } }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Too many picks');
  });

  it('returns 400 when player is picked in multiple divisions', async () => {
    mockGet.mockResolvedValueOnce({ Item: { eventId: 'e1', status: 'scheduled' } });
    mockGet.mockResolvedValueOnce({ Item: { defaultBudget: 500, defaultPicksPerDivision: 2 } });
    mockScanAll.mockResolvedValueOnce([{ playerId: 'p1', name: 'A', divisionId: 'd1' }]);
    mockScanAll.mockResolvedValueOnce([]);
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: ['p1'], d2: ['p1'] } }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('picked in multiple divisions');
  });

  it('returns 400 when player does not exist', async () => {
    mockGet.mockResolvedValueOnce({ Item: { eventId: 'e1', status: 'scheduled' } });
    mockGet.mockResolvedValueOnce({ Item: {} });
    mockScanAll.mockResolvedValueOnce([]);
    mockScanAll.mockResolvedValueOnce([]);
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: ['p99'] } }) }));
    expect((await handler(ev, ctx, cb))!.statusCode).toBe(400);
  });

  it('returns 400 when player does not belong to division', async () => {
    mockGet.mockResolvedValueOnce({ Item: { eventId: 'e1', status: 'scheduled' } });
    mockGet.mockResolvedValueOnce({ Item: {} });
    mockScanAll.mockResolvedValueOnce([{ playerId: 'p1', name: 'Rock', divisionId: 'd2' }]);
    mockScanAll.mockResolvedValueOnce([]);
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: ['p1'] } }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('does not belong to division');
  });

  it('returns 400 when total cost exceeds budget', async () => {
    mockGet.mockResolvedValueOnce({ Item: { eventId: 'e1', status: 'scheduled' } });
    mockGet.mockResolvedValueOnce({ Item: { defaultBudget: 100, defaultPicksPerDivision: 2 } });
    mockScanAll.mockResolvedValueOnce([{ playerId: 'p1', name: 'A', divisionId: 'd1' }, { playerId: 'p2', name: 'B', divisionId: 'd1' }]);
    mockScanAll.mockResolvedValueOnce([{ playerId: 'p1', currentCost: 60 }, { playerId: 'p2', currentCost: 60 }]);
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: ['p1', 'p2'] } }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('exceeds budget');
  });

  it('creates picks successfully and returns 200', async () => {
    setupValidPicks();
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: ['p1'] } }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toMatchObject({ eventId: 'e1', fantasyUserId: 'user-1', totalSpent: 100 });
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it('preserves createdAt on update', async () => {
    mockGet.mockResolvedValueOnce({ Item: { eventId: 'e1', status: 'scheduled' } });
    mockGet.mockResolvedValueOnce({ Item: {} });
    mockScanAll.mockResolvedValueOnce([{ playerId: 'p1', name: 'A', divisionId: 'd1' }]);
    mockScanAll.mockResolvedValueOnce([{ playerId: 'p1', currentCost: 50 }]);
    mockGet.mockResolvedValueOnce({ Item: { createdAt: '2024-01-01T00:00:00.000Z' } });
    mockPut.mockResolvedValueOnce({});
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: ['p1'] } }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).createdAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('returns 500 on unexpected error', async () => {
    mockGet.mockRejectedValueOnce(new Error('DynamoDB failure'));
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: ['p1'] } }) }));
    expect((await handler(ev, ctx, cb))!.statusCode).toBe(500);
  });

  it('uses default cost of 100 when player has no cost record', async () => {
    mockGet.mockResolvedValueOnce({ Item: { eventId: 'e1', status: 'scheduled' } });
    mockGet.mockResolvedValueOnce({ Item: { defaultBudget: 500, defaultPicksPerDivision: 2 } });
    mockScanAll.mockResolvedValueOnce([{ playerId: 'p1', name: 'A', divisionId: 'd1' }]);
    mockScanAll.mockResolvedValueOnce([]);
    mockGet.mockResolvedValueOnce({ Item: undefined });
    mockPut.mockResolvedValueOnce({});
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: ['p1'] } }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).totalSpent).toBe(100);
  });

  it('returns 400 when division picks is not an array', async () => {
    mockGet.mockResolvedValueOnce({ Item: { eventId: 'e1', status: 'scheduled' } });
    mockGet.mockResolvedValueOnce({ Item: {} });
    mockScanAll.mockResolvedValueOnce([]);
    mockScanAll.mockResolvedValueOnce([]);
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: 'not-array' } }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('must be an array');
  });
});
