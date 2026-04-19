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

import { handler } from '../getFantasyLeaderboard';

// ---- Helpers ---------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {},
    httpMethod: 'GET', isBase64Encoded: false, path: '/',
    pathParameters: null, queryStringParameters: null,
    multiValueQueryStringParameters: null, stageVariables: null,
    resource: '', requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

// ---- Tests -----------------------------------------------------------------

describe('getFantasyLeaderboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty leaderboard when no picks exist', async () => {
    mockFantasyRepo.listAllPicks.mockResolvedValueOnce([]);
    mockEventsRepo.list.mockResolvedValueOnce([]);

    const result = await handler(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([]);
  });

  it('aggregates points across events and assigns ranks', async () => {
    mockFantasyRepo.listAllPicks.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', username: 'Alice', pointsEarned: 20 },
      { eventId: 'e1', fantasyUserId: 'u2', username: 'Bob', pointsEarned: 30 },
      { eventId: 'e2', fantasyUserId: 'u1', username: 'Alice', pointsEarned: 15 },
    ]);
    mockEventsRepo.list.mockResolvedValueOnce([
      { eventId: 'e1', status: 'completed', date: '2024-01-01' },
      { eventId: 'e2', status: 'completed', date: '2024-01-15' },
    ]);

    const result = await handler(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(2);
    // Alice: 20+15 = 35, Bob: 30  => Alice rank 1, Bob rank 2
    expect(body[0].username).toBe('Alice');
    expect(body[0].totalPoints).toBe(35);
    expect(body[0].rank).toBe(1);
    expect(body[1].username).toBe('Bob');
    expect(body[1].totalPoints).toBe(30);
    expect(body[1].rank).toBe(2);
  });

  it('filters by seasonId when provided', async () => {
    mockFantasyRepo.listAllPicks.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', username: 'Alice', pointsEarned: 20 },
      { eventId: 'e2', fantasyUserId: 'u1', username: 'Alice', pointsEarned: 50 },
    ]);
    mockEventsRepo.list.mockResolvedValueOnce([
      { eventId: 'e1', seasonId: 's1', status: 'completed', date: '2024-01-01' },
      { eventId: 'e2', status: 'completed', date: '2024-02-01' },
    ]);

    const result = await handler(
      makeEvent({ queryStringParameters: { seasonId: 's1' } }),
      ctx, cb,
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(1);
    // currentSeasonPoints should only include e1
    expect(body[0].currentSeasonPoints).toBe(20);
    // totalPoints includes both
    expect(body[0].totalPoints).toBe(70);
  });

  it('only counts picks for completed events', async () => {
    mockFantasyRepo.listAllPicks.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', username: 'Alice', pointsEarned: 20 },
      { eventId: 'e2', fantasyUserId: 'u1', username: 'Alice', pointsEarned: 99 },
    ]);
    // Only e1 is completed
    mockEventsRepo.list.mockResolvedValueOnce([
      { eventId: 'e1', status: 'completed', date: '2024-01-01' },
    ]);

    const result = await handler(makeEvent(), ctx, cb);
    const body = JSON.parse(result!.body);
    expect(body[0].totalPoints).toBe(20);
  });

  it('calculates perfect picks when all wrestlers scored > 0', async () => {
    mockFantasyRepo.listAllPicks.mockResolvedValueOnce([
      {
        eventId: 'e1', fantasyUserId: 'u1', username: 'Alice', pointsEarned: 30,
        breakdown: { p1: { points: 10 }, p2: { points: 20 } },
      },
    ]);
    mockEventsRepo.list.mockResolvedValueOnce([
      { eventId: 'e1', status: 'completed', date: '2024-01-01' },
    ]);

    const result = await handler(makeEvent(), ctx, cb);
    const body = JSON.parse(result!.body);
    expect(body[0].perfectPicks).toBe(1);
  });

  it('does not count perfect pick when any wrestler scored 0', async () => {
    mockFantasyRepo.listAllPicks.mockResolvedValueOnce([
      {
        eventId: 'e1', fantasyUserId: 'u1', username: 'Alice', pointsEarned: 10,
        breakdown: { p1: { points: 10 }, p2: { points: 0 } },
      },
    ]);
    mockEventsRepo.list.mockResolvedValueOnce([
      { eventId: 'e1', status: 'completed', date: '2024-01-01' },
    ]);

    const result = await handler(makeEvent(), ctx, cb);
    expect(JSON.parse(result!.body)[0].perfectPicks).toBe(0);
  });

  it('calculates current streak correctly', async () => {
    mockFantasyRepo.listAllPicks.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', username: 'A', pointsEarned: 10 },
      { eventId: 'e2', fantasyUserId: 'u1', username: 'A', pointsEarned: 5 },
      { eventId: 'e3', fantasyUserId: 'u1', username: 'A', pointsEarned: 20 },
    ]);
    mockEventsRepo.list.mockResolvedValueOnce([
      { eventId: 'e1', status: 'completed', date: '2024-01-01' },
      { eventId: 'e2', status: 'completed', date: '2024-01-08' },
      { eventId: 'e3', status: 'completed', date: '2024-01-15' },
    ]);

    const result = await handler(makeEvent(), ctx, cb);
    // All 3 events have points > 0 walking backwards: streak = 3
    expect(JSON.parse(result!.body)[0].currentStreak).toBe(3);
  });

  it('breaks streak when user scored 0 in an event', async () => {
    mockFantasyRepo.listAllPicks.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', username: 'A', pointsEarned: 10 },
      { eventId: 'e2', fantasyUserId: 'u1', username: 'A', pointsEarned: 0 },
      { eventId: 'e3', fantasyUserId: 'u1', username: 'A', pointsEarned: 20 },
    ]);
    mockEventsRepo.list.mockResolvedValueOnce([
      { eventId: 'e1', status: 'completed', date: '2024-01-01' },
      { eventId: 'e2', status: 'completed', date: '2024-01-08' },
      { eventId: 'e3', status: 'completed', date: '2024-01-15' },
    ]);

    const result = await handler(makeEvent(), ctx, cb);
    // Walking backwards: e3=20 (streak 1), e2=0 (break) => streak = 1
    expect(JSON.parse(result!.body)[0].currentStreak).toBe(1);
  });

  it('skips non-participated events for streak (does not break)', async () => {
    mockFantasyRepo.listAllPicks.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', username: 'A', pointsEarned: 10 },
      // u1 did not participate in e2
      { eventId: 'e3', fantasyUserId: 'u1', username: 'A', pointsEarned: 20 },
    ]);
    mockEventsRepo.list.mockResolvedValueOnce([
      { eventId: 'e1', status: 'completed', date: '2024-01-01' },
      { eventId: 'e2', status: 'completed', date: '2024-01-08' },
      { eventId: 'e3', status: 'completed', date: '2024-01-15' },
    ]);

    const result = await handler(makeEvent(), ctx, cb);
    // e3=20 (streak 1), e2=skipped, e1=10 (streak 2) => streak = 2
    expect(JSON.parse(result!.body)[0].currentStreak).toBe(2);
  });

  it('sorts by currentSeasonPoints descending, then totalPoints', async () => {
    mockFantasyRepo.listAllPicks.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', username: 'A', pointsEarned: 50 },
      { eventId: 'e1', fantasyUserId: 'u2', username: 'B', pointsEarned: 50 },
      { eventId: 'e2', fantasyUserId: 'u1', username: 'A', pointsEarned: 10 },
    ]);
    mockEventsRepo.list.mockResolvedValueOnce([
      { eventId: 'e1', status: 'completed', date: '2024-01-01' },
      { eventId: 'e2', status: 'completed', date: '2024-01-08' },
    ]);

    const result = await handler(makeEvent(), ctx, cb);
    const body = JSON.parse(result!.body);
    // A: season=60, B: season=50  =>  A first
    expect(body[0].username).toBe('A');
    expect(body[1].username).toBe('B');
  });

  it('returns 500 on unexpected error', async () => {
    mockFantasyRepo.listAllPicks.mockRejectedValueOnce(new Error('DynamoDB failure'));

    const result = await handler(makeEvent(), ctx, cb);
    expect(result!.statusCode).toBe(500);
  });

  it('uses truncated fantasyUserId as username fallback', async () => {
    mockFantasyRepo.listAllPicks.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'abcdefgh-1234-5678', pointsEarned: 10 },
    ]);
    mockEventsRepo.list.mockResolvedValueOnce([
      { eventId: 'e1', status: 'completed', date: '2024-01-01' },
    ]);

    const result = await handler(makeEvent(), ctx, cb);
    const body = JSON.parse(result!.body);
    expect(body[0].username).toBe('abcdefgh');
  });
});
