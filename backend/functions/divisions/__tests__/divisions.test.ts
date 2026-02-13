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
    DIVISIONS: 'Divisions',
    PLAYERS: 'Players',
  },
}));

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

import { handler as getDivisions } from '../getDivisions';
import { handler as createDivision } from '../createDivision';

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

// ─── getDivisions ────────────────────────────────────────────────────

describe('getDivisions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all divisions via scan', async () => {
    mockScan.mockResolvedValue({
      Items: [
        { divisionId: 'div-1', name: 'Raw' },
        { divisionId: 'div-2', name: 'SmackDown' },
      ],
    });

    const result = await getDivisions(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe('Raw');
    expect(body[1].name).toBe('SmackDown');
    expect(mockScan).toHaveBeenCalledWith({ TableName: 'Divisions' });
  });

  it('returns empty array when no divisions exist', async () => {
    mockScan.mockResolvedValue({ Items: undefined });

    const result = await getDivisions(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([]);
  });

  it('returns 500 on DynamoDB error', async () => {
    mockScan.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await getDivisions(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch divisions');
  });
});

// ─── createDivision ──────────────────────────────────────────────────

describe('createDivision', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a division with name only and returns 201', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({ body: JSON.stringify({ name: 'Raw' }) });

    const result = await createDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.divisionId).toBe('test-uuid-1234');
    expect(body.name).toBe('Raw');
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
    expect(body.description).toBeUndefined();
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it('creates a division with name and description', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({
      body: JSON.stringify({ name: 'SmackDown', description: 'Friday Night SmackDown' }),
    });

    const result = await createDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.name).toBe('SmackDown');
    expect(body.description).toBe('Friday Night SmackDown');
  });

  it('returns 400 when name is missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ description: 'No name' }) });

    const result = await createDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Name is required');
  });

  it('returns 400 when name is empty string', async () => {
    const event = makeEvent({ body: JSON.stringify({ name: '' }) });

    const result = await createDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Name is required');
  });

  it('returns 400 when body is null', async () => {
    const result = await createDivision(makeEvent({ body: null }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 when body is malformed JSON', async () => {
    const result = await createDivision(makeEvent({ body: '{bad json' }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 500 on DynamoDB error', async () => {
    mockPut.mockRejectedValue(new Error('DynamoDB failure'));
    const event = makeEvent({ body: JSON.stringify({ name: 'Raw' }) });

    const result = await createDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to create division');
  });
});
