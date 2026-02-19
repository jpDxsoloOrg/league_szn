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

vi.mock('uuid', () => ({
  v4: () => 'test-season-uuid',
}));

import { handler as getSeasons } from '../getSeasons';
import { handler as createSeason } from '../createSeason';

// ─── Helpers ─────────────────────────────────────────────────────────

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

// ─── getSeasons ──────────────────────────────────────────────────────

describe('getSeasons', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all seasons sorted by startDate descending', async () => {
    mockScan.mockResolvedValue({
      Items: [
        { seasonId: 's1', name: 'Season 1', startDate: '2024-01-01' },
        { seasonId: 's3', name: 'Season 3', startDate: '2024-09-01' },
        { seasonId: 's2', name: 'Season 2', startDate: '2024-05-01' },
      ],
    });

    const result = await getSeasons(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(3);
    expect(body[0].seasonId).toBe('s3');
    expect(body[1].seasonId).toBe('s2');
    expect(body[2].seasonId).toBe('s1');
  });

  it('returns empty array when no seasons exist', async () => {
    mockScan.mockResolvedValue({ Items: undefined });

    const result = await getSeasons(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([]);
  });

  it('returns 500 when DynamoDB throws', async () => {
    mockScan.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await getSeasons(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch seasons');
  });
});

// ─── createSeason ────────────────────────────────────────────────────

describe('createSeason', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a season with status active and returns 201', async () => {
    mockScan.mockResolvedValue({ Items: [] });
    mockPut.mockResolvedValue({});

    const event = makeEvent({
      body: JSON.stringify({ name: 'Season 1', startDate: '2024-01-01' }),
    });

    const result = await createSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.seasonId).toBe('test-season-uuid');
    expect(body.name).toBe('Season 1');
    expect(body.startDate).toBe('2024-01-01');
    expect(body.status).toBe('active');
    expect(body.endDate).toBeNull();
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it('creates a season with an optional endDate', async () => {
    mockScan.mockResolvedValue({ Items: [] });
    mockPut.mockResolvedValue({});

    const event = makeEvent({
      body: JSON.stringify({ name: 'Season 1', startDate: '2024-01-01', endDate: '2024-06-30' }),
    });

    const result = await createSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.endDate).toBe('2024-06-30');
  });

  it('returns 400 when name is missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ startDate: '2024-01-01' }),
    });

    const result = await createSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('name is required');
  });

  it('returns 400 when startDate is missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: 'Season 1' }),
    });

    const result = await createSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('startDate is required');
  });

  it('returns 400 when body is null', async () => {
    const event = makeEvent({ body: null });

    const result = await createSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 when body is invalid JSON', async () => {
    const event = makeEvent({ body: '{not valid json' });

    const result = await createSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 409 when an active season already exists', async () => {
    mockScan.mockResolvedValue({
      Items: [{ seasonId: 'existing', name: 'Active Season', status: 'active' }],
    });

    const event = makeEvent({
      body: JSON.stringify({ name: 'New Season', startDate: '2024-07-01' }),
    });

    const result = await createSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(409);
    expect(JSON.parse(result!.body).message).toContain('already an active season');
  });

  it('returns 500 when DynamoDB put throws', async () => {
    mockScan.mockResolvedValue({ Items: [] });
    mockPut.mockRejectedValue(new Error('DynamoDB failure'));

    const event = makeEvent({
      body: JSON.stringify({ name: 'Season 1', startDate: '2024-01-01' }),
    });

    const result = await createSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to create season');
  });
});
