import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockPut, mockScan, mockGet } = vi.hoisted(() => ({
  mockPut: vi.fn(),
  mockScan: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet, put: mockPut, scan: mockScan, query: vi.fn(),
    update: vi.fn(), delete: vi.fn(), scanAll: vi.fn(), queryAll: vi.fn(),
  },
  TableNames: { EVENTS: 'Events', LOCATIONS: 'Locations' },
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
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: empty locations table — random-pick is a no-op.
    mockScan.mockResolvedValue({ Items: [] });
  });

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
    expect(body.venue).toBeUndefined();
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
        seasonId: 'season-1',
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

// ─── Random-pick (LOC-01) ────────────────────────────────────────────

describe('createEvent — location random-pick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPut.mockResolvedValue({});
  });

  it('does not stamp a location when the locations table is empty', async () => {
    mockScan.mockResolvedValue({ Items: [] });
    const event = makeEvent({
      body: JSON.stringify({ name: 'Raw', eventType: 'weekly', date: '2025-02-01' }),
    });

    const result = await createEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.locationId).toBeUndefined();
    expect(body.venue).toBeUndefined();
  });

  it('picks a random location when none is supplied and stamps locationId + venue', async () => {
    mockScan.mockResolvedValue({
      Items: [
        { locationId: 'l1', name: 'MSG', city: 'New York' },
        { locationId: 'l2', name: 'Allstate Arena' },
        { locationId: 'l3', name: 'T-Mobile Arena', city: 'Las Vegas' },
      ],
    });
    // Force the picker to choose index 0 deterministically.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    const event = makeEvent({
      body: JSON.stringify({ name: 'SmackDown', eventType: 'weekly', date: '2025-02-07' }),
    });

    const result = await createEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.locationId).toBe('l1');
    expect(body.venue).toBe('MSG, New York');

    randomSpy.mockRestore();
  });

  it('uses just the name when picked location has no city', async () => {
    mockScan.mockResolvedValue({
      Items: [{ locationId: 'l2', name: 'Allstate Arena' }],
    });
    const event = makeEvent({
      body: JSON.stringify({ name: 'NXT', eventType: 'weekly', date: '2025-02-08' }),
    });

    const result = await createEvent(event, ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.locationId).toBe('l2');
    expect(body.venue).toBe('Allstate Arena');
  });

  it('honors an explicit locationId by looking it up and denormalizing venue', async () => {
    mockGet.mockResolvedValue({
      Item: { locationId: 'l9', name: 'Tokyo Dome', city: 'Tokyo' },
    });

    const event = makeEvent({
      body: JSON.stringify({
        name: 'Wrestle Kingdom',
        eventType: 'ppv',
        date: '2026-01-04',
        locationId: 'l9',
      }),
    });

    const result = await createEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.locationId).toBe('l9');
    expect(body.venue).toBe('Tokyo Dome, Tokyo');
    expect(mockScan).not.toHaveBeenCalled();
  });

  it('returns 404 when an explicit locationId does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    const event = makeEvent({
      body: JSON.stringify({
        name: 'Mystery Show',
        eventType: 'weekly',
        date: '2026-02-01',
        locationId: 'does-not-exist',
      }),
    });

    const result = await createEvent(event, ctx, cb);
    expect(result!.statusCode).toBe(404);
  });

  it('keeps caller-supplied venue and skips random-pick', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        name: 'House Show',
        eventType: 'house',
        date: '2025-03-01',
        venue: 'Local Civic Center',
      }),
    });

    const result = await createEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.venue).toBe('Local Civic Center');
    expect(body.locationId).toBeUndefined();
    expect(mockScan).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('keeps caller-supplied venue even when locationId is also provided', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        name: 'House Show',
        eventType: 'house',
        date: '2025-03-01',
        venue: 'Local Civic Center',
        locationId: 'l1',
      }),
    });

    const result = await createEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.venue).toBe('Local Civic Center');
    expect(body.locationId).toBe('l1');
    expect(mockGet).not.toHaveBeenCalled();
  });
});
