import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Mocks ----------------------------------------------------------------

const { mockScan } = vi.hoisted(() => ({
  mockScan: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: vi.fn(),
    put: vi.fn(),
    scan: vi.fn(),
    query: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    scanAll: mockScan,
    queryAll: vi.fn(),
  },
  TableNames: {
    MATCHES: 'Matches',
  },
}));

import { handler as getMatches } from '../getMatches';

// ---- Helpers ---------------------------------------------------------------

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

// ---- Tests -----------------------------------------------------------------

describe('getMatches', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all matches sorted by date descending', async () => {
    mockScan.mockResolvedValue({
      Items: [
        { matchId: 'm1', date: '2024-01-01T00:00:00Z', status: 'completed' },
        { matchId: 'm3', date: '2024-03-01T00:00:00Z', status: 'scheduled' },
        { matchId: 'm2', date: '2024-02-01T00:00:00Z', status: 'completed' },
      ],
    });

    const result = await getMatches(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(3);
    // Most recent first
    expect(body[0].matchId).toBe('m3');
    expect(body[1].matchId).toBe('m2');
    expect(body[2].matchId).toBe('m1');
  });

  it('returns empty array when no matches exist', async () => {
    mockScan.mockResolvedValue({ Items: undefined });

    const result = await getMatches(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([]);
  });

  it('filters by status query parameter', async () => {
    mockScan.mockResolvedValue({
      Items: [{ matchId: 'm1', date: '2024-01-01T00:00:00Z', status: 'scheduled' }],
    });

    const event = makeEvent({
      queryStringParameters: { status: 'scheduled' },
    });

    const result = await getMatches(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    // Verify scan was called with filter expression
    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'scheduled' },
      }),
    );
  });

  it('does not add filter when no status parameter provided', async () => {
    mockScan.mockResolvedValue({ Items: [] });

    await getMatches(makeEvent(), ctx, cb);

    const callArgs = mockScan.mock.calls[0][0];
    expect(callArgs.FilterExpression).toBeUndefined();
    expect(callArgs.ExpressionAttributeNames).toBeUndefined();
    expect(callArgs.ExpressionAttributeValues).toBeUndefined();
  });

  it('filters by playerId using contains on participants', async () => {
    mockScan.mockResolvedValue({ Items: [] });

    const event = makeEvent({
      queryStringParameters: { playerId: 'p1' },
    });

    await getMatches(event, ctx, cb);

    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({
        FilterExpression: 'contains(#participants, :playerId)',
        ExpressionAttributeNames: expect.objectContaining({ '#participants': 'participants' }),
        ExpressionAttributeValues: expect.objectContaining({ ':playerId': 'p1' }),
      }),
    );
  });

  it('filters by matchType in-memory with normalized aliases', async () => {
    mockScan.mockResolvedValue({
      Items: [
        { matchId: 'm1', date: '2024-01-01T00:00:00Z', matchFormat: 'singles' },
        { matchId: 'm2', date: '2024-01-02T00:00:00Z', matchFormat: 'Tag Team' },
      ],
    });

    const event = makeEvent({
      queryStringParameters: { matchType: 'Singles' },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([
      { matchId: 'm1', date: '2024-01-01T00:00:00Z', matchFormat: 'singles' },
    ]);

    const callArgs = mockScan.mock.calls[0][0];
    const filterExpr = callArgs.FilterExpression as string | undefined;
    expect(filterExpr ?? '').not.toContain('#matchFormat');
  });

  it('matches legacy tag values when filtering by Tag Team', async () => {
    mockScan.mockResolvedValue({
      Items: [
        { matchId: 'm1', date: '2024-01-01T00:00:00Z', matchFormat: 'tag' },
        { matchId: 'm2', date: '2024-01-02T00:00:00Z', matchFormat: 'tag team' },
        { matchId: 'm3', date: '2024-01-03T00:00:00Z', matchFormat: 'Singles' },
      ],
    });

    const event = makeEvent({
      queryStringParameters: { matchType: 'Tag Team' },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([
      { matchId: 'm2', date: '2024-01-02T00:00:00Z', matchFormat: 'tag team' },
      { matchId: 'm1', date: '2024-01-01T00:00:00Z', matchFormat: 'tag' },
    ]);
  });

  it('matches tag aliases when query uses tag-team format', async () => {
    mockScan.mockResolvedValue({
      Items: [
        { matchId: 'm1', date: '2024-01-01T00:00:00Z', matchFormat: 'tag' },
        { matchId: 'm2', date: '2024-01-02T00:00:00Z', matchFormat: 'Tag Team' },
        { matchId: 'm3', date: '2024-01-03T00:00:00Z', matchFormat: 'tag-team' },
        { matchId: 'm4', date: '2024-01-04T00:00:00Z', matchFormat: 'Singles' },
      ],
    });

    const event = makeEvent({
      queryStringParameters: { matchType: 'tag-team' },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([
      { matchId: 'm3', date: '2024-01-03T00:00:00Z', matchFormat: 'tag-team' },
      { matchId: 'm2', date: '2024-01-02T00:00:00Z', matchFormat: 'Tag Team' },
      { matchId: 'm1', date: '2024-01-01T00:00:00Z', matchFormat: 'tag' },
    ]);
  });

  it('matches tag aliases when query uses tagteam format', async () => {
    mockScan.mockResolvedValue({
      Items: [
        { matchId: 'm1', date: '2024-01-01T00:00:00Z', matchFormat: 'tagteam' },
        { matchId: 'm2', date: '2024-01-02T00:00:00Z', matchFormat: 'tag-team' },
        { matchId: 'm3', date: '2024-01-03T00:00:00Z', matchFormat: 'tag team' },
        { matchId: 'm4', date: '2024-01-04T00:00:00Z', matchFormat: 'Singles' },
      ],
    });

    const event = makeEvent({
      queryStringParameters: { matchType: 'tagteam' },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([
      { matchId: 'm3', date: '2024-01-03T00:00:00Z', matchFormat: 'tag team' },
      { matchId: 'm2', date: '2024-01-02T00:00:00Z', matchFormat: 'tag-team' },
      { matchId: 'm1', date: '2024-01-01T00:00:00Z', matchFormat: 'tagteam' },
    ]);
  });

  it('filters using legacy matchType field when matchFormat is missing', async () => {
    mockScan.mockResolvedValue({
      Items: [
        { matchId: 'm1', date: '2024-01-01T00:00:00Z', matchType: 'singles' },
        { matchId: 'm2', date: '2024-01-02T00:00:00Z', matchType: 'tag' },
      ],
    });

    const event = makeEvent({
      queryStringParameters: { matchType: 'Singles' },
    });

    const result = await getMatches(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([
      { matchId: 'm1', date: '2024-01-01T00:00:00Z', matchType: 'singles' },
    ]);
  });

  it('filters by stipulationId', async () => {
    mockScan.mockResolvedValue({ Items: [] });

    const event = makeEvent({
      queryStringParameters: { stipulationId: 'stip1' },
    });

    await getMatches(event, ctx, cb);

    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({
        FilterExpression: '#stipulationId = :stipulationId',
        ExpressionAttributeNames: expect.objectContaining({ '#stipulationId': 'stipulationId' }),
        ExpressionAttributeValues: expect.objectContaining({ ':stipulationId': 'stip1' }),
      }),
    );
  });

  it('filters by championshipId', async () => {
    mockScan.mockResolvedValue({ Items: [] });

    const event = makeEvent({
      queryStringParameters: { championshipId: 'champ1' },
    });

    await getMatches(event, ctx, cb);

    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({
        FilterExpression: '#championshipId = :championshipId',
        ExpressionAttributeNames: expect.objectContaining({ '#championshipId': 'championshipId' }),
        ExpressionAttributeValues: expect.objectContaining({ ':championshipId': 'champ1' }),
      }),
    );
  });

  it('filters by seasonId', async () => {
    mockScan.mockResolvedValue({ Items: [] });

    const event = makeEvent({
      queryStringParameters: { seasonId: 's1' },
    });

    await getMatches(event, ctx, cb);

    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({
        FilterExpression: '#seasonId = :seasonId',
        ExpressionAttributeNames: expect.objectContaining({ '#seasonId': 'seasonId' }),
        ExpressionAttributeValues: expect.objectContaining({ ':seasonId': 's1' }),
      }),
    );
  });

  it('filters by dateFrom', async () => {
    mockScan.mockResolvedValue({ Items: [] });

    const event = makeEvent({
      queryStringParameters: { dateFrom: '2024-01-01' },
    });

    await getMatches(event, ctx, cb);

    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({
        FilterExpression: '#date >= :dateFrom',
        ExpressionAttributeNames: expect.objectContaining({ '#date': 'date' }),
        ExpressionAttributeValues: expect.objectContaining({ ':dateFrom': '2024-01-01' }),
      }),
    );
  });

  it('filters by dateTo', async () => {
    mockScan.mockResolvedValue({ Items: [] });

    const event = makeEvent({
      queryStringParameters: { dateTo: '2024-12-31' },
    });

    await getMatches(event, ctx, cb);

    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({
        FilterExpression: '#date <= :dateTo',
        ExpressionAttributeNames: expect.objectContaining({ '#date': 'date' }),
        ExpressionAttributeValues: expect.objectContaining({ ':dateTo': '2024-12-31' }),
      }),
    );
  });

  it('combines multiple filters with AND logic', async () => {
    mockScan.mockResolvedValue({ Items: [] });

    const event = makeEvent({
      queryStringParameters: {
        status: 'completed',
        playerId: 'p1',
        matchType: 'Singles',
        seasonId: 's1',
      },
    });

    await getMatches(event, ctx, cb);

    const callArgs = mockScan.mock.calls[0][0];
    const filterExpr = callArgs.FilterExpression as string;
    expect(filterExpr).toContain('#status = :status');
    expect(filterExpr).toContain('contains(#participants, :playerId)');
    expect(filterExpr).toContain('#seasonId = :seasonId');
    expect(filterExpr.split(' AND ')).toHaveLength(3);
  });

  it('combines dateFrom and dateTo into a single expression', async () => {
    mockScan.mockResolvedValue({ Items: [] });

    const event = makeEvent({
      queryStringParameters: {
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
      },
    });

    await getMatches(event, ctx, cb);

    const callArgs = mockScan.mock.calls[0][0];
    const filterExpr = callArgs.FilterExpression as string;
    expect(filterExpr).toContain('#date >= :dateFrom');
    expect(filterExpr).toContain('#date <= :dateTo');
    expect(filterExpr.split(' AND ')).toHaveLength(2);
  });
  it('returns 500 when scan throws', async () => {
    mockScan.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await getMatches(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch matches');
  });
});
