import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const { mockScanAll, mockGet } = vi.hoisted(() => ({
  mockScanAll: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet,
    put: vi.fn(),
    scan: vi.fn(),
    query: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    scanAll: mockScanAll,
    queryAll: vi.fn(),
  },
  TableNames: {
    PLAYERS: 'Players',
    MATCHES: 'Matches',
    CHAMPIONSHIPS: 'Championships',
    CHAMPIONSHIP_HISTORY: 'ChampionshipHistory',
    TOURNAMENTS: 'Tournaments',
    SEASONS: 'Seasons',
    CHALLENGES: 'Challenges',
    PROMOS: 'Promos',
  },
}));

import { handler as getActivity } from '../getActivity';

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/activity',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: { authorizer: {} } as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

describe('getActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScanAll.mockResolvedValue([]);
    mockGet.mockResolvedValue({ Item: { name: 'Test Player', currentWrestler: 'Wrestler' } });
  });

  it('returns empty items and null nextCursor when no data', async () => {
    const result = await getActivity(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it('returns merged and sorted activity items', async () => {
    mockScanAll
      .mockResolvedValueOnce([
        {
          matchId: 'm1',
          date: '2024-02-01T12:00:00.000Z',
          updatedAt: '2024-02-01T14:00:00.000Z',
          status: 'completed',
          participants: ['p1', 'p2'],
          winners: ['p1'],
          losers: ['p2'],
          matchFormat: 'singles',
        },
      ])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([]);

    const result = await getActivity(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].type).toBe('match_result');
    expect(body.items[0].timestamp).toBe('2024-02-01T14:00:00.000Z');
    expect(body.items[0].id).toBe('match-m1');
    expect(body.items[0].summary).toBe('Test Player def. Test Player');
    expect(body.nextCursor).toBeNull();
  });

  it('excludes matches without updatedAt from activity', async () => {
    mockScanAll
      .mockResolvedValueOnce([
        {
          matchId: 'm1',
          date: '2024-02-01T12:00:00.000Z',
          updatedAt: '2024-02-01T14:00:00.000Z',
          status: 'completed',
          participants: ['p1', 'p2'],
          winners: ['p1'],
          losers: ['p2'],
          matchFormat: 'singles',
        },
        {
          matchId: 'm2',
          date: '2024-02-02T12:00:00.000Z',
          status: 'completed',
          participants: ['p1', 'p2'],
          winners: ['p2'],
          losers: ['p1'],
          matchFormat: 'singles',
        },
      ])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([]);

    const result = await getActivity(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].metadata.matchId).toBe('m1');
  });

  it('respects limit param', async () => {
    const match = {
      matchId: 'm1',
      date: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      status: 'completed',
      participants: ['p1', 'p2'],
      winners: ['p1'],
      losers: ['p2'],
      matchFormat: 'singles',
    };
    mockScanAll
      .mockResolvedValueOnce([
        match,
        { ...match, matchId: 'm2', date: '2024-01-02T00:00:00.000Z', updatedAt: '2024-01-02T00:00:00.000Z' },
        { ...match, matchId: 'm3', date: '2024-01-03T00:00:00.000Z', updatedAt: '2024-01-03T00:00:00.000Z' },
      ])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([]);

    const result = await getActivity(
      makeEvent({ queryStringParameters: { limit: '2' } }),
      ctx,
      cb
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.items).toHaveLength(2);
    expect(body.nextCursor).toBe(`${body.items[1].timestamp}|${body.items[1].id}`);
  });

  it('applies cursor-based pagination', async () => {
    const match = {
      matchId: 'm1',
      date: '2024-01-01T00:00:00.000Z',
      status: 'completed',
      participants: ['p1', 'p2'],
      winners: ['p1'],
      losers: ['p2'],
      matchFormat: 'singles',
    };
    mockScanAll
      .mockResolvedValueOnce([
        { ...match, matchId: 'm3', date: '2024-01-03T00:00:00.000Z', updatedAt: '2024-01-03T00:00:00.000Z' },
        { ...match, matchId: 'm2', date: '2024-01-02T00:00:00.000Z', updatedAt: '2024-01-02T00:00:00.000Z' },
        { ...match, matchId: 'm1', date: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
      ])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([]);

    const result = await getActivity(
      makeEvent({ queryStringParameters: { limit: '2', cursor: '2024-01-02T12:00:00.000Z' } }),
      ctx,
      cb
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].metadata.matchId).toBe('m2');
    expect(body.items[1].metadata.matchId).toBe('m1');
  });

  it('when type=match only scans Matches table', async () => {
    mockScanAll.mockResolvedValue([]);

    await getActivity(
      makeEvent({ queryStringParameters: { type: 'match' } }),
      ctx,
      cb
    );

    expect(mockScanAll).toHaveBeenCalledTimes(1);
    expect(mockScanAll).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'Matches',
        FilterExpression: '#s = :status',
      })
    );
  });

  it('returns 500 when DynamoDB scanAll throws', async () => {
    mockScanAll.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await getActivity(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch activity');
  });
});
