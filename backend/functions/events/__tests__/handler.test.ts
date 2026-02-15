import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const {
  mockGet,
  mockPut,
  mockScan,
  mockQuery,
  mockUpdate,
  mockDelete,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockScan: vi.fn(),
  mockQuery: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet,
    put: mockPut,
    scan: mockScan,
    query: mockQuery,
    update: mockUpdate,
    delete: mockDelete,
  },
  TableNames: { EVENTS: 'Events' },
}));

vi.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

vi.mock('../../../lib/auth', () => ({
  requireRole: () => undefined,
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

describe('events router', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /events routes to getEvents and returns 200', async () => {
    mockScan.mockResolvedValue({ Items: [{ eventId: 'e1', name: 'WrestleMania', date: '2025-04-01' }] });
    const event = makeEvent({ httpMethod: 'GET', path: '/dev/events', pathParameters: null });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toHaveLength(1);
  });

  it('GET /events/{eventId} routes to getEvent', async () => {
    mockGet.mockResolvedValue({ Item: { eventId: 'e1', name: 'WrestleMania' } });
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/dev/events/e1',
      pathParameters: { eventId: 'e1' },
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).eventId).toBe('e1');
  });

  it('POST /events routes to createEvent and returns 201', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/dev/events',
      pathParameters: null,
      body: JSON.stringify({ name: 'WrestleMania', eventType: 'ppv', date: '2025-04-01' }),
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(201);
    expect(JSON.parse(result!.body).eventId).toBe('test-uuid-1234');
  });

  it('PUT /events/{eventId} routes to updateEvent', async () => {
    mockGet.mockResolvedValue({ Item: { eventId: 'e1', name: 'Old' } });
    mockUpdate.mockResolvedValue({});
    const event = makeEvent({
      httpMethod: 'PUT',
      path: '/dev/events/e1',
      pathParameters: { eventId: 'e1' },
      body: JSON.stringify({ name: 'Updated', eventType: 'ppv', date: '2025-04-01' }),
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
  });

  it('DELETE /events/{eventId} routes to deleteEvent', async () => {
    mockGet.mockResolvedValue({ Item: { eventId: 'e1' } });
    mockDelete.mockResolvedValue({});
    const event = makeEvent({
      httpMethod: 'DELETE',
      path: '/dev/events/e1',
      pathParameters: { eventId: 'e1' },
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(204);
  });

  it('returns 405 for unsupported method/path', async () => {
    const event = makeEvent({
      httpMethod: 'PATCH',
      path: '/dev/events',
      pathParameters: null,
    });
    const result = await handler(event, ctx, cb);
    expect(result!.statusCode).toBe(405);
  });
});
