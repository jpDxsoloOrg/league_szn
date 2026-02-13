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

import { handler as updateDivision } from '../updateDivision';
import { handler as deleteDivision } from '../deleteDivision';

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

// ─── updateDivision ──────────────────────────────────────────────────

describe('updateDivision', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates division name and returns updated record', async () => {
    mockGet.mockResolvedValue({ Item: { divisionId: 'div-1', name: 'Raw' } });
    mockUpdate.mockResolvedValue({
      Attributes: { divisionId: 'div-1', name: 'Raw Updated', updatedAt: '2024-01-01' },
    });

    const event = makeEvent({
      pathParameters: { divisionId: 'div-1' },
      body: JSON.stringify({ name: 'Raw Updated' }),
    });

    const result = await updateDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).name).toBe('Raw Updated');
    expect(mockUpdate).toHaveBeenCalledOnce();
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.UpdateExpression).toContain('#name = :name');
    expect(updateCall.UpdateExpression).toContain('#updatedAt = :updatedAt');
    expect(updateCall.ReturnValues).toBe('ALL_NEW');
  });

  it('updates division description', async () => {
    mockGet.mockResolvedValue({ Item: { divisionId: 'div-1', name: 'Raw' } });
    mockUpdate.mockResolvedValue({
      Attributes: { divisionId: 'div-1', name: 'Raw', description: 'Monday Night Raw' },
    });

    const event = makeEvent({
      pathParameters: { divisionId: 'div-1' },
      body: JSON.stringify({ description: 'Monday Night Raw' }),
    });

    const result = await updateDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.UpdateExpression).toContain('#description = :description');
  });

  it('always updates the updatedAt timestamp', async () => {
    mockGet.mockResolvedValue({ Item: { divisionId: 'div-1', name: 'Raw' } });
    mockUpdate.mockResolvedValue({ Attributes: { divisionId: 'div-1' } });

    const event = makeEvent({
      pathParameters: { divisionId: 'div-1' },
      body: JSON.stringify({ name: 'New Name' }),
    });

    await updateDivision(event, ctx, cb);

    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.UpdateExpression).toContain('#updatedAt = :updatedAt');
    expect(updateCall.ExpressionAttributeNames['#updatedAt']).toBe('updatedAt');
    expect(updateCall.ExpressionAttributeValues[':updatedAt']).toBeDefined();
  });

  it('returns 400 when divisionId is missing from path', async () => {
    const event = makeEvent({
      pathParameters: null,
      body: JSON.stringify({ name: 'X' }),
    });

    const result = await updateDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Division ID is required');
  });

  it('returns 400 when body is null', async () => {
    const event = makeEvent({
      pathParameters: { divisionId: 'div-1' },
      body: null,
    });

    const result = await updateDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 404 when division does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });

    const event = makeEvent({
      pathParameters: { divisionId: 'nonexistent' },
      body: JSON.stringify({ name: 'X' }),
    });

    const result = await updateDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Division not found');
  });

  it('returns 500 on DynamoDB error', async () => {
    mockGet.mockResolvedValue({ Item: { divisionId: 'div-1' } });
    mockUpdate.mockRejectedValue(new Error('DynamoDB failure'));

    const event = makeEvent({
      pathParameters: { divisionId: 'div-1' },
      body: JSON.stringify({ name: 'X' }),
    });

    const result = await updateDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to update division');
  });
});

// ─── deleteDivision ──────────────────────────────────────────────────

describe('deleteDivision', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes division and returns 204', async () => {
    mockGet.mockResolvedValue({ Item: { divisionId: 'div-1', name: 'Raw' } });
    mockScan.mockResolvedValue({ Items: [] });
    mockDelete.mockResolvedValue({});

    const event = makeEvent({ pathParameters: { divisionId: 'div-1' } });

    const result = await deleteDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({
      TableName: 'Divisions',
      Key: { divisionId: 'div-1' },
    });
  });

  it('returns 400 when divisionId is missing from path', async () => {
    const result = await deleteDivision(makeEvent({ pathParameters: null }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Division ID is required');
  });

  it('returns 404 when division does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });

    const event = makeEvent({ pathParameters: { divisionId: 'nonexistent' } });

    const result = await deleteDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Division not found');
  });

  it('returns 409 when players are assigned to the division', async () => {
    mockGet.mockResolvedValue({ Item: { divisionId: 'div-1', name: 'Raw' } });
    mockScan.mockResolvedValue({
      Items: [
        { playerId: 'p1', name: 'John', divisionId: 'div-1' },
        { playerId: 'p2', name: 'Jane', divisionId: 'div-1' },
      ],
    });

    const event = makeEvent({ pathParameters: { divisionId: 'div-1' } });

    const result = await deleteDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(409);
    expect(JSON.parse(result!.body).message).toContain('2 player(s)');
    expect(JSON.parse(result!.body).message).toContain('Cannot delete division');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('returns 409 with correct count for single player', async () => {
    mockGet.mockResolvedValue({ Item: { divisionId: 'div-1', name: 'Raw' } });
    mockScan.mockResolvedValue({
      Items: [{ playerId: 'p1', name: 'John', divisionId: 'div-1' }],
    });

    const event = makeEvent({ pathParameters: { divisionId: 'div-1' } });

    const result = await deleteDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(409);
    expect(JSON.parse(result!.body).message).toContain('1 player(s)');
  });

  it('deletes when player scan returns undefined Items', async () => {
    mockGet.mockResolvedValue({ Item: { divisionId: 'div-1', name: 'Raw' } });
    mockScan.mockResolvedValue({ Items: undefined });
    mockDelete.mockResolvedValue({});

    const event = makeEvent({ pathParameters: { divisionId: 'div-1' } });

    const result = await deleteDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    expect(mockDelete).toHaveBeenCalledOnce();
  });

  it('returns 500 on DynamoDB error', async () => {
    mockGet.mockRejectedValue(new Error('DynamoDB failure'));

    const event = makeEvent({ pathParameters: { divisionId: 'div-1' } });

    const result = await deleteDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to delete division');
  });
});
