import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// --- Mocks ---

const { mockScan } = vi.hoisted(() => ({
  mockScan: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    scan: mockScan,
  },
  TableNames: {
    TOURNAMENTS: 'Tournaments',
  },
}));

import { handler as getTournaments } from '../getTournaments';

// --- Helpers ---

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

// --- getTournaments ---

describe('getTournaments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all tournaments sorted by createdAt descending', async () => {
    mockScan.mockResolvedValue({
      Items: [
        { tournamentId: 't1', name: 'Old Tournament', createdAt: '2024-01-01T00:00:00Z' },
        { tournamentId: 't2', name: 'New Tournament', createdAt: '2024-06-01T00:00:00Z' },
      ],
    });

    const result = await getTournaments(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe('New Tournament');
    expect(body[1].name).toBe('Old Tournament');
  });

  it('returns empty array when no tournaments exist', async () => {
    mockScan.mockResolvedValue({ Items: undefined });

    const result = await getTournaments(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([]);
  });

  it('returns 500 when scan throws', async () => {
    mockScan.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await getTournaments(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch tournaments');
  });
});
