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
    scan: mockScan,
    query: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    scanAll: vi.fn(),
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

  it('returns 500 when scan throws', async () => {
    mockScan.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await getMatches(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch matches');
  });
});
