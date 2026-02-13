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
    SEASONS: 'Seasons',
    SEASON_STANDINGS: 'SeasonStandings',
  },
}));

import { handler as updateSeason } from '../updateSeason';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'PUT',
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

// ─── updateSeason ────────────────────────────────────────────────────

describe('updateSeason', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates season name and returns updated attributes', async () => {
    mockGet.mockResolvedValue({ Item: { seasonId: 's1', name: 'Old', status: 'active' } });
    mockUpdate.mockResolvedValue({ Attributes: { seasonId: 's1', name: 'New Name', status: 'active' } });

    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      body: JSON.stringify({ name: 'New Name' }),
    });

    const result = await updateSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).name).toBe('New Name');
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.UpdateExpression).toContain('#name = :name');
    expect(updateCall.ExpressionAttributeNames['#name']).toBe('name');
  });

  it('updates endDate field', async () => {
    mockGet.mockResolvedValue({ Item: { seasonId: 's1', status: 'active' } });
    mockUpdate.mockResolvedValue({ Attributes: { seasonId: 's1', endDate: '2024-12-31' } });

    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      body: JSON.stringify({ endDate: '2024-12-31' }),
    });

    const result = await updateSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.UpdateExpression).toContain('endDate = :endDate');
  });

  it('auto-sets endDate when completing a season that has no endDate', async () => {
    mockGet.mockResolvedValue({ Item: { seasonId: 's1', status: 'active', endDate: null } });
    mockUpdate.mockResolvedValue({ Attributes: { seasonId: 's1', status: 'completed' } });

    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      body: JSON.stringify({ status: 'completed' }),
    });

    const result = await updateSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.UpdateExpression).toContain('#status = :status');
    expect(updateCall.UpdateExpression).toContain('endDate = :autoEndDate');
    expect(updateCall.ExpressionAttributeValues[':status']).toBe('completed');
    expect(updateCall.ExpressionAttributeValues[':autoEndDate']).toBeDefined();
  });

  it('does not auto-set endDate when endDate is provided in body', async () => {
    mockGet.mockResolvedValue({ Item: { seasonId: 's1', status: 'active', endDate: null } });
    mockUpdate.mockResolvedValue({ Attributes: { seasonId: 's1', status: 'completed', endDate: '2024-12-25' } });

    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      body: JSON.stringify({ status: 'completed', endDate: '2024-12-25' }),
    });

    const result = await updateSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.UpdateExpression).not.toContain(':autoEndDate');
    expect(updateCall.ExpressionAttributeValues[':endDate']).toBe('2024-12-25');
  });

  it('does not auto-set endDate when season already has endDate', async () => {
    mockGet.mockResolvedValue({ Item: { seasonId: 's1', status: 'active', endDate: '2024-11-30' } });
    mockUpdate.mockResolvedValue({ Attributes: { seasonId: 's1', status: 'completed' } });

    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      body: JSON.stringify({ status: 'completed' }),
    });

    const result = await updateSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.UpdateExpression).not.toContain(':autoEndDate');
  });

  it('returns 400 when seasonId is missing from path', async () => {
    const event = makeEvent({
      pathParameters: null,
      body: JSON.stringify({ name: 'X' }),
    });

    const result = await updateSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Season ID is required');
  });

  it('returns 404 when season does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });

    const event = makeEvent({
      pathParameters: { seasonId: 'missing' },
      body: JSON.stringify({ name: 'X' }),
    });

    const result = await updateSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Season not found');
  });

  it('returns 409 when trying to activate while another season is active', async () => {
    mockGet.mockResolvedValue({ Item: { seasonId: 's1', status: 'completed' } });
    mockScan.mockResolvedValue({ Items: [{ seasonId: 's2', status: 'active' }] });

    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      body: JSON.stringify({ status: 'active' }),
    });

    const result = await updateSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(409);
    expect(JSON.parse(result!.body).message).toContain('already an active season');
  });

  it('allows activating when no other active season exists', async () => {
    mockGet.mockResolvedValue({ Item: { seasonId: 's1', status: 'completed' } });
    mockScan.mockResolvedValue({ Items: [] });
    mockUpdate.mockResolvedValue({ Attributes: { seasonId: 's1', status: 'active' } });

    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      body: JSON.stringify({ status: 'active' }),
    });

    const result = await updateSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).status).toBe('active');
  });

  it('skips active-season check when season is already active', async () => {
    mockGet.mockResolvedValue({ Item: { seasonId: 's1', status: 'active' } });
    mockUpdate.mockResolvedValue({ Attributes: { seasonId: 's1', status: 'active', name: 'Updated' } });

    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      body: JSON.stringify({ status: 'active', name: 'Updated' }),
    });

    const result = await updateSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockScan).not.toHaveBeenCalled();
  });

  it('omits ExpressionAttributeNames when no reserved words are used', async () => {
    mockGet.mockResolvedValue({ Item: { seasonId: 's1', status: 'active' } });
    mockUpdate.mockResolvedValue({ Attributes: { seasonId: 's1', endDate: '2024-12-31' } });

    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      body: JSON.stringify({ endDate: '2024-12-31' }),
    });

    await updateSeason(event, ctx, cb);

    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.ExpressionAttributeNames).toBeUndefined();
  });

  it('returns 400 for invalid JSON body', async () => {
    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      body: '{bad json',
    });

    const result = await updateSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 500 when DynamoDB update throws', async () => {
    mockGet.mockResolvedValue({ Item: { seasonId: 's1', status: 'active' } });
    mockUpdate.mockRejectedValue(new Error('DynamoDB failure'));

    const event = makeEvent({
      pathParameters: { seasonId: 's1' },
      body: JSON.stringify({ name: 'Boom' }),
    });

    const result = await updateSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to update season');
  });
});
