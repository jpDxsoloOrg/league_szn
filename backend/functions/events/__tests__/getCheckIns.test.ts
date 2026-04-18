import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockQueryAll, mockScan } = vi.hoisted(() => ({
  mockQueryAll: vi.fn(),
  mockScan: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: vi.fn(),
    put: vi.fn(),
    query: vi.fn(),
    scan: mockScan,
    update: vi.fn(),
    delete: vi.fn(),
    queryAll: mockQueryAll,
    scanAll: vi.fn(),
  },
  TableNames: {
    EVENT_CHECK_INS: 'EventCheckIns',
    PLAYERS: 'Players',
  },
}));

import { handler as getCheckIns } from '../getCheckIns';

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

function withAuth(
  event: APIGatewayProxyEvent,
  groups: string,
  sub = 'user-sub-1',
): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: sub },
    } as any,
  };
}

const roster = [
  { playerId: 'p1', name: 'Alice', currentWrestler: 'Stone Cold', imageUrl: 'a.png' },
  { playerId: 'p2', name: 'Bob', currentWrestler: 'The Rock' },
  { playerId: 'p3', name: 'Carol', currentWrestler: 'Undertaker', divisionId: 'div-1' },
  { playerId: 'p4', name: 'Dave', currentWrestler: 'HBK' },
  // Fantasy-only user (no wrestler) should be excluded
  { playerId: 'p5', name: 'Eve', currentWrestler: '' },
];

// ─── Tests ───────────────────────────────────────────────────────────

describe('getCheckIns', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns grouped roster with all four buckets for an admin call', async () => {
    mockQueryAll.mockResolvedValue([
      { eventId: 'evt-1', playerId: 'p1', status: 'available' },
      { eventId: 'evt-1', playerId: 'p2', status: 'tentative' },
      { eventId: 'evt-1', playerId: 'p3', status: 'unavailable' },
    ]);
    mockScan.mockResolvedValue({ Items: roster });

    const event = withAuth(makeEvent({ pathParameters: { eventId: 'evt-1' } }), 'Admin');
    const result = await getCheckIns(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.available).toHaveLength(1);
    expect(body.available[0].playerId).toBe('p1');
    expect(body.tentative).toHaveLength(1);
    expect(body.tentative[0].playerId).toBe('p2');
    expect(body.unavailable).toHaveLength(1);
    expect(body.unavailable[0].playerId).toBe('p3');
    expect(body.noResponse).toHaveLength(1);
    expect(body.noResponse[0].playerId).toBe('p4');
  });

  it('returns 403 for a non-admin (Wrestler) caller', async () => {
    const event = withAuth(makeEvent({ pathParameters: { eventId: 'evt-1' } }), 'Wrestler');
    const result = await getCheckIns(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toBe(
      'Only admins and moderators can view event check-ins',
    );
    expect(mockQueryAll).not.toHaveBeenCalled();
  });

  it('returns all wrestlers in noResponse when the event has no check-ins', async () => {
    mockQueryAll.mockResolvedValue([]);
    mockScan.mockResolvedValue({ Items: roster });

    const event = withAuth(makeEvent({ pathParameters: { eventId: 'evt-1' } }), 'Admin');
    const result = await getCheckIns(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.available).toEqual([]);
    expect(body.tentative).toEqual([]);
    expect(body.unavailable).toEqual([]);
    // Four wrestlers with a currentWrestler; the Fantasy-only user (p5) is excluded
    expect(body.noResponse).toHaveLength(4);
    expect(body.noResponse.map((p: { playerId: string }) => p.playerId).sort()).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
    ]);
  });
});
