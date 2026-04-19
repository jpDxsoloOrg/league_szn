import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Mocks ----------------------------------------------------------------

const mockFantasyRepo = {
  getConfig: vi.fn(),
  upsertConfig: vi.fn(),
  findPick: vi.fn(),
  listPicksByEvent: vi.fn(),
  listPicksByUser: vi.fn(),
  listAllPicks: vi.fn(),
  savePick: vi.fn(),
  updatePickScoring: vi.fn(),
  deletePick: vi.fn(),
  findCost: vi.fn(),
  listAllCosts: vi.fn(),
  upsertCost: vi.fn(),
  initializeCost: vi.fn(),
};

const mockEventsRepo = {
  findById: vi.fn(),
  list: vi.fn(),
};

const mockPlayersRepo = {
  findById: vi.fn(),
  list: vi.fn(),
};

const mockMatchesRepo = {
  findById: vi.fn(),
  list: vi.fn(),
};

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    fantasy: mockFantasyRepo,
    events: mockEventsRepo,
    players: mockPlayersRepo,
    matches: mockMatchesRepo,
  }),
}));

vi.mock('../getFantasyConfig', () => ({
  DEFAULT_CONFIG: {
    configKey: 'GLOBAL', defaultBudget: 500, defaultPicksPerDivision: 2,
    baseWinPoints: 10, championshipBonus: 5, titleWinBonus: 10,
    titleDefenseBonus: 5, costFluctuationEnabled: true, costChangePerWin: 10,
    costChangePerLoss: 5, costResetStrategy: 'reset', underdogMultiplier: 1.5,
    perfectPickBonus: 50, streakBonusThreshold: 5, streakBonusPoints: 25,
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
  stageVariables: null, resource: '', requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
};
const makeEvent = (o: Partial<APIGatewayProxyEvent> = {}) => ({ ...base, ...o }) as APIGatewayProxyEvent;

const withAuth = (ev: APIGatewayProxyEvent, groups = 'Fantasy', sub = 'user-1') => ({
  ...ev, requestContext: { ...ev.requestContext,
    authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: sub },
  } as unknown as APIGatewayProxyEvent['requestContext'],
}) as APIGatewayProxyEvent;

function setupValidPicks() {
  mockEventsRepo.findById.mockResolvedValueOnce({ eventId: 'e1', status: 'scheduled' });
  mockFantasyRepo.getConfig.mockResolvedValueOnce({ defaultBudget: 500, defaultPicksPerDivision: 2 });
  mockPlayersRepo.list.mockResolvedValueOnce([
    { playerId: 'p1', name: 'Rock', divisionId: 'd1' },
    { playerId: 'p2', name: 'Cena', divisionId: 'd1' },
  ]);
  mockFantasyRepo.listAllCosts.mockResolvedValueOnce([
    { playerId: 'p1', currentCost: 100 },
    { playerId: 'p2', currentCost: 150 },
  ]);
  mockFantasyRepo.findPick.mockResolvedValueOnce(null);
  mockFantasyRepo.savePick.mockImplementationOnce((input: Record<string, unknown>) => Promise.resolve({
    ...input,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
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
    mockEventsRepo.findById.mockResolvedValueOnce({ eventId: 'e1', status: 'scheduled' });
    mockFantasyRepo.getConfig.mockResolvedValueOnce(null);
    mockPlayersRepo.list.mockResolvedValueOnce([]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([]);
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: 'bad' }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('picks must be an object');
  });

  it('returns 404 when event does not exist', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce(null);
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: {} }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(404);
  });

  it('returns 400 when event is completed', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({ eventId: 'e1', status: 'completed' });
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: {} }) }));
    expect((await handler(ev, ctx, cb))!.statusCode).toBe(400);
  });

  it('returns 400 when event is cancelled', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({ eventId: 'e1', status: 'cancelled' });
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: {} }) }));
    expect((await handler(ev, ctx, cb))!.statusCode).toBe(400);
  });

  it('returns 400 when event is fantasy-locked', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({ eventId: 'e1', status: 'scheduled', fantasyLocked: true });
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: {} }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Picks are locked for this event');
  });

  it('returns 400 when too many picks for a division', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({ eventId: 'e1', status: 'scheduled' });
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ defaultBudget: 500, defaultPicksPerDivision: 1 });
    mockPlayersRepo.list.mockResolvedValueOnce([
      { playerId: 'p1', name: 'A', divisionId: 'd1' },
      { playerId: 'p2', name: 'B', divisionId: 'd1' },
    ]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([]);
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: ['p1', 'p2'] } }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Too many picks');
  });

  it('returns 400 when player is picked in multiple divisions', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({ eventId: 'e1', status: 'scheduled' });
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ defaultBudget: 500, defaultPicksPerDivision: 2 });
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1', name: 'A', divisionId: 'd1' }]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([]);
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: ['p1'], d2: ['p1'] } }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('picked in multiple divisions');
  });

  it('returns 400 when player does not exist', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({ eventId: 'e1', status: 'scheduled' });
    mockFantasyRepo.getConfig.mockResolvedValueOnce(null);
    mockPlayersRepo.list.mockResolvedValueOnce([]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([]);
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: ['p99'] } }) }));
    expect((await handler(ev, ctx, cb))!.statusCode).toBe(400);
  });

  it('returns 400 when player does not belong to division', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({ eventId: 'e1', status: 'scheduled' });
    mockFantasyRepo.getConfig.mockResolvedValueOnce(null);
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1', name: 'Rock', divisionId: 'd2' }]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([]);
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: ['p1'] } }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('does not belong to division');
  });

  it('returns 400 when total cost exceeds budget', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({ eventId: 'e1', status: 'scheduled' });
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ defaultBudget: 100, defaultPicksPerDivision: 2 });
    mockPlayersRepo.list.mockResolvedValueOnce([
      { playerId: 'p1', name: 'A', divisionId: 'd1' },
      { playerId: 'p2', name: 'B', divisionId: 'd1' },
    ]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([
      { playerId: 'p1', currentCost: 60 },
      { playerId: 'p2', currentCost: 60 },
    ]);
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
    expect(mockFantasyRepo.savePick).toHaveBeenCalledOnce();
  });

  it('preserves createdAt on update', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({ eventId: 'e1', status: 'scheduled' });
    mockFantasyRepo.getConfig.mockResolvedValueOnce(null);
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1', name: 'A', divisionId: 'd1' }]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([{ playerId: 'p1', currentCost: 50 }]);
    mockFantasyRepo.findPick.mockResolvedValueOnce({ createdAt: '2024-01-01T00:00:00.000Z' });
    mockFantasyRepo.savePick.mockImplementationOnce((input: Record<string, unknown>, existingCreatedAt: string) =>
      Promise.resolve({ ...input, createdAt: existingCreatedAt, updatedAt: new Date().toISOString() }),
    );
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: ['p1'] } }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).createdAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('returns 500 on unexpected error', async () => {
    mockEventsRepo.findById.mockRejectedValueOnce(new Error('DynamoDB failure'));
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: ['p1'] } }) }));
    expect((await handler(ev, ctx, cb))!.statusCode).toBe(500);
  });

  it('uses default cost of 100 when player has no cost record', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({ eventId: 'e1', status: 'scheduled' });
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ defaultBudget: 500, defaultPicksPerDivision: 2 });
    mockPlayersRepo.list.mockResolvedValueOnce([{ playerId: 'p1', name: 'A', divisionId: 'd1' }]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([]);
    mockFantasyRepo.findPick.mockResolvedValueOnce(null);
    mockFantasyRepo.savePick.mockImplementationOnce((input: Record<string, unknown>) =>
      Promise.resolve({ ...input, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
    );
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: ['p1'] } }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).totalSpent).toBe(100);
  });

  it('returns 400 when division picks is not an array', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({ eventId: 'e1', status: 'scheduled' });
    mockFantasyRepo.getConfig.mockResolvedValueOnce(null);
    mockPlayersRepo.list.mockResolvedValueOnce([]);
    mockFantasyRepo.listAllCosts.mockResolvedValueOnce([]);
    const ev = withAuth(makeEvent({ pathParameters: { eventId: 'e1' }, body: JSON.stringify({ picks: { d1: 'not-array' } }) }));
    const result = await handler(ev, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('must be an array');
  });
});
