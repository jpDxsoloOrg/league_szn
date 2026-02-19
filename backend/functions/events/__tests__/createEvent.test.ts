import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockPut } = vi.hoisted(() => ({
  mockPut: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: vi.fn(), put: mockPut, scan: vi.fn(), query: vi.fn(),
    update: vi.fn(), delete: vi.fn(), scanAll: vi.fn(), queryAll: vi.fn(),
  },
  TableNames: { EVENTS: 'Events' },
}));

vi.mock('uuid', () => ({ v4: () => 'test-event-uuid' }));

import { handler as createEvent } from '../createEvent';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'POST',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: {} } as any, ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('createEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an event with required fields and returns 201', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({
      body: JSON.stringify({ name: 'WrestleMania', eventType: 'ppv', date: '2025-04-06' }),
    });

    const result = await createEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.eventId).toBe('test-event-uuid');
    expect(body.name).toBe('WrestleMania');
    expect(body.eventType).toBe('ppv');
    expect(body.date).toBe('2025-04-06');
    expect(body.status).toBe('upcoming');
    expect(body.matchCards).toEqual([]);
    expect(body.fantasyEnabled).toBe(true);
    expect(body.venue).toBeNull();
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it('creates an event with all optional fields', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({
      body: JSON.stringify({
        name: 'Royal Rumble', eventType: 'ppv', date: '2025-01-25',
        venue: 'Lucas Oil Stadium', description: 'Annual Rumble event',
        imageUrl: 'https://example.com/image.png', themeColor: '#FF0000',
        seasonId: 'season-1', fantasyBudget: 500, fantasyPicksPerDivision: 3,
      }),
    });

    const result = await createEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.venue).toBe('Lucas Oil Stadium');
    expect(body.description).toBe('Annual Rumble event');
    expect(body.imageUrl).toBe('https://example.com/image.png');
    expect(body.themeColor).toBe('#FF0000');
    expect(body.seasonId).toBe('season-1');
    expect(body.fantasyBudget).toBe(500);
    expect(body.fantasyPicksPerDivision).toBe(3);
  });

  it('returns 400 when request body is missing', async () => {
    const result = await createEvent(makeEvent({ body: null }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 for invalid JSON in request body', async () => {
    const result = await createEvent(makeEvent({ body: '{bad json' }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 400 when name is missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ eventType: 'ppv', date: '2025-04-06' }) });
    const result = await createEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('name is required');
  });

  it('returns 400 when eventType is missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ name: 'WrestleMania', date: '2025-04-06' }) });
    const result = await createEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('eventType is required');
  });

  it('returns 400 when date is missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ name: 'WrestleMania', eventType: 'ppv' }) });
    const result = await createEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('date is required');
  });

  it('returns 400 for invalid eventType', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: 'WrestleMania', eventType: 'invalid', date: '2025-04-06' }),
    });
    const result = await createEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('eventType must be one of ppv, weekly, special, or house');
  });

  it('accepts all valid eventType values (ppv, weekly, special, house)', async () => {
    for (const eventType of ['ppv', 'weekly', 'special', 'house']) {
      vi.clearAllMocks();
      mockPut.mockResolvedValue({});
      const event = makeEvent({
        body: JSON.stringify({ name: 'Event', eventType, date: '2025-01-01' }),
      });
      const result = await createEvent(event, ctx, cb);
      expect(result!.statusCode).toBe(201);
      expect(JSON.parse(result!.body).eventType).toBe(eventType);
    }
  });

  it('returns 500 when DynamoDB put fails', async () => {
    mockPut.mockRejectedValue(new Error('DynamoDB error'));
    const event = makeEvent({
      body: JSON.stringify({ name: 'WrestleMania', eventType: 'ppv', date: '2025-04-06' }),
    });
    const result = await createEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to create event');
  });
});
