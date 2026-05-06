import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const {
  mockLocationsList,
  mockLocationsFindById,
  mockLocationsCreate,
  mockLocationsUpdate,
  mockLocationsDelete,
  mockLocationsBulkImport,
} = vi.hoisted(() => ({
  mockLocationsList: vi.fn(),
  mockLocationsFindById: vi.fn(),
  mockLocationsCreate: vi.fn(),
  mockLocationsUpdate: vi.fn(),
  mockLocationsDelete: vi.fn(),
  mockLocationsBulkImport: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    leagueOps: {
      locations: {
        list: mockLocationsList,
        findById: mockLocationsFindById,
        create: mockLocationsCreate,
        update: mockLocationsUpdate,
        delete: mockLocationsDelete,
        bulkImport: mockLocationsBulkImport,
      },
    },
  }),
  NotFoundError: class extends Error {
    constructor(entity: string, id: string) {
      super(`${entity} ${id} not found`);
      this.name = 'NotFoundError';
    }
  },
  ConflictError: class extends Error {},
  ConcurrencyError: class extends Error {},
}));

import { handler as getLocations } from '../getLocations';
import { handler as getLocation } from '../getLocation';
import { handler as createLocation } from '../createLocation';
import { handler as updateLocation } from '../updateLocation';
import { handler as deleteLocation } from '../deleteLocation';
import { handler as bulkImport } from '../bulkImport';

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
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

// ─── getLocations ────────────────────────────────────────────────────

describe('getLocations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all locations sorted by name', async () => {
    mockLocationsList.mockResolvedValue([
      { locationId: 'l1', name: 'Madison Square Garden' },
      { locationId: 'l2', name: 'Allstate Arena' },
      { locationId: 'l3', name: 'T-Mobile Arena' },
    ]);

    const result = await getLocations(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body[0].name).toBe('Allstate Arena');
    expect(body[1].name).toBe('Madison Square Garden');
    expect(body[2].name).toBe('T-Mobile Arena');
  });

  it('returns 500 on repository error', async () => {
    mockLocationsList.mockRejectedValue(new Error('boom'));
    const result = await getLocations(makeEvent(), ctx, cb);
    expect(result!.statusCode).toBe(500);
  });
});

// ─── getLocation ─────────────────────────────────────────────────────

describe('getLocation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the location when found', async () => {
    mockLocationsFindById.mockResolvedValue({ locationId: 'l1', name: 'MSG' });
    const result = await getLocation(
      makeEvent({ pathParameters: { locationId: 'l1' } }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).name).toBe('MSG');
  });

  it('returns 404 when not found', async () => {
    mockLocationsFindById.mockResolvedValue(null);
    const result = await getLocation(
      makeEvent({ pathParameters: { locationId: 'l1' } }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(404);
  });

  it('returns 400 when locationId is missing', async () => {
    const result = await getLocation(makeEvent(), ctx, cb);
    expect(result!.statusCode).toBe(400);
  });
});

// ─── createLocation ──────────────────────────────────────────────────

describe('createLocation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a location with required fields and returns 201', async () => {
    mockLocationsCreate.mockResolvedValue({
      locationId: 'l1',
      name: 'MSG',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const event = makeEvent({
      body: JSON.stringify({ name: 'MSG' }),
    });

    const result = await createLocation(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    expect(mockLocationsCreate).toHaveBeenCalledWith({ name: 'MSG' });
  });

  it('passes optional fields through', async () => {
    mockLocationsCreate.mockResolvedValue({});
    const event = makeEvent({
      body: JSON.stringify({
        name: 'MSG',
        city: 'New York',
        state: 'NY',
        country: 'USA',
        capacity: 20000,
        latitude: 40.7505,
        longitude: -73.9934,
        imageUrl: 'https://example.com/msg.jpg',
        notes: 'Iconic venue',
      }),
    });

    await createLocation(event, ctx, cb);

    expect(mockLocationsCreate).toHaveBeenCalledWith({
      name: 'MSG',
      city: 'New York',
      state: 'NY',
      country: 'USA',
      capacity: 20000,
      latitude: 40.7505,
      longitude: -73.9934,
      imageUrl: 'https://example.com/msg.jpg',
      notes: 'Iconic venue',
    });
  });

  it('returns 400 when name is missing', async () => {
    const result = await createLocation(
      makeEvent({ body: JSON.stringify({ city: 'New York' }) }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(400);
  });
});

// ─── updateLocation ──────────────────────────────────────────────────

describe('updateLocation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates a location and returns 200', async () => {
    mockLocationsUpdate.mockResolvedValue({ locationId: 'l1', name: 'New Name' });
    const result = await updateLocation(
      makeEvent({
        pathParameters: { locationId: 'l1' },
        body: JSON.stringify({ name: 'New Name' }),
      }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(200);
    expect(mockLocationsUpdate).toHaveBeenCalledWith('l1', { name: 'New Name' });
  });

  it('returns 400 when no patch fields provided', async () => {
    const result = await updateLocation(
      makeEvent({
        pathParameters: { locationId: 'l1' },
        body: JSON.stringify({}),
      }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(400);
  });

  it('returns 400 when id is missing', async () => {
    const result = await updateLocation(
      makeEvent({ body: JSON.stringify({ name: 'X' }) }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(400);
  });
});

// ─── deleteLocation ──────────────────────────────────────────────────

describe('deleteLocation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes the location and returns 204', async () => {
    mockLocationsFindById.mockResolvedValue({ locationId: 'l1', name: 'MSG' });
    mockLocationsDelete.mockResolvedValue(undefined);
    const result = await deleteLocation(
      makeEvent({ pathParameters: { locationId: 'l1' } }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(204);
    expect(mockLocationsDelete).toHaveBeenCalledWith('l1');
  });

  it('returns 404 when location does not exist', async () => {
    mockLocationsFindById.mockResolvedValue(null);
    const result = await deleteLocation(
      makeEvent({ pathParameters: { locationId: 'l1' } }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(404);
    expect(mockLocationsDelete).not.toHaveBeenCalled();
  });
});

// ─── bulkImport ──────────────────────────────────────────────────────

describe('bulkImport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards validated rows to the repo and returns the result', async () => {
    mockLocationsBulkImport.mockResolvedValue({
      created: 2,
      skipped: 0,
      skippedNames: [],
    });

    const event = makeEvent({
      body: JSON.stringify({
        locations: [
          { name: 'MSG', city: 'New York' },
          { name: 'Allstate Arena' },
        ],
      }),
    });

    const result = await bulkImport(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.created).toBe(2);
    expect(body.skipped).toBe(0);
    expect(mockLocationsBulkImport).toHaveBeenCalledWith([
      { name: 'MSG', city: 'New York' },
      { name: 'Allstate Arena' },
    ]);
  });

  it('returns 400 when locations is not an array', async () => {
    const result = await bulkImport(
      makeEvent({ body: JSON.stringify({ locations: 'nope' }) }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(400);
  });

  it('returns 400 when a row is missing name', async () => {
    const result = await bulkImport(
      makeEvent({
        body: JSON.stringify({ locations: [{ city: 'NYC' }] }),
      }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('name');
  });

  it('returns 400 when a row has wrong field type', async () => {
    const result = await bulkImport(
      makeEvent({
        body: JSON.stringify({
          locations: [{ name: 'MSG', capacity: 'lots' }],
        }),
      }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('capacity');
  });
});
