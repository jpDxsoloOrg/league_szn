import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockGet, mockUpdate } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet, put: vi.fn(), scan: vi.fn(), query: vi.fn(),
    update: mockUpdate, delete: vi.fn(), scanAll: vi.fn(), queryAll: vi.fn(),
  },
  TableNames: { EVENTS: 'Events' },
}));

import { handler as updateEvent } from '../updateEvent';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'PUT',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: {} } as any, ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('updateEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when eventId path parameter is missing', async () => {
    const event = makeEvent({ pathParameters: null, body: JSON.stringify({ name: 'X' }) });
    const result = await updateEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Event ID is required');
  });

  it('returns 400 when request body is missing', async () => {
    const event = makeEvent({ pathParameters: { eventId: 'e1' }, body: null });
    const result = await updateEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 for invalid JSON body', async () => {
    const event = makeEvent({ pathParameters: { eventId: 'e1' }, body: '{invalid' });
    const result = await updateEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 404 when event does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    const event = makeEvent({
      pathParameters: { eventId: 'nonexistent' },
      body: JSON.stringify({ name: 'Updated' }),
    });
    const result = await updateEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Event not found');
  });

  it('returns 400 for invalid eventType', async () => {
    mockGet.mockResolvedValue({ Item: { eventId: 'e1' } });
    const event = makeEvent({
      pathParameters: { eventId: 'e1' },
      body: JSON.stringify({ eventType: 'invalid' }),
    });
    const result = await updateEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('eventType must be one of: ppv, weekly, special, house');
  });

  it('returns 400 for invalid status', async () => {
    mockGet.mockResolvedValue({ Item: { eventId: 'e1' } });
    const event = makeEvent({
      pathParameters: { eventId: 'e1' },
      body: JSON.stringify({ status: 'invalid-status' }),
    });
    const result = await updateEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe(
      'status must be one of: upcoming, in-progress, completed, cancelled'
    );
  });

  it('returns 400 when no valid fields to update', async () => {
    mockGet.mockResolvedValue({ Item: { eventId: 'e1' } });
    const event = makeEvent({
      pathParameters: { eventId: 'e1' },
      body: JSON.stringify({}),
    });
    const result = await updateEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('No valid fields to update');
  });

  it('updates event name and returns updated attributes', async () => {
    mockGet.mockResolvedValue({ Item: { eventId: 'e1', name: 'Old' } });
    mockUpdate.mockResolvedValue({
      Attributes: { eventId: 'e1', name: 'New Name' },
    });
    const event = makeEvent({
      pathParameters: { eventId: 'e1' },
      body: JSON.stringify({ name: 'New Name' }),
    });

    const result = await updateEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).name).toBe('New Name');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ Key: { eventId: 'e1' }, ReturnValues: 'ALL_NEW' })
    );
  });

  it('updates multiple fields at once including updatedAt', async () => {
    mockGet.mockResolvedValue({ Item: { eventId: 'e1' } });
    mockUpdate.mockResolvedValue({
      Attributes: { eventId: 'e1', name: 'Updated', venue: 'Arena', status: 'in-progress' },
    });
    const event = makeEvent({
      pathParameters: { eventId: 'e1' },
      body: JSON.stringify({
        name: 'Updated', venue: 'Arena', status: 'in-progress',
        attendance: 50000, rating: 4.5, fantasyEnabled: false, fantasyLocked: true,
      }),
    });

    const result = await updateEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const call = mockUpdate.mock.calls[0][0];
    expect(call.UpdateExpression).toContain('#name = :name');
    expect(call.UpdateExpression).toContain('#venue = :venue');
    expect(call.UpdateExpression).toContain('#status = :status');
    expect(call.UpdateExpression).toContain('#attendance = :attendance');
    expect(call.UpdateExpression).toContain('#rating = :rating');
    expect(call.UpdateExpression).toContain('#fantasyEnabled = :fantasyEnabled');
    expect(call.UpdateExpression).toContain('#fantasyLocked = :fantasyLocked');
    expect(call.UpdateExpression).toContain('#updatedAt = :updatedAt');
  });

  it('updates matchCards array', async () => {
    mockGet.mockResolvedValue({ Item: { eventId: 'e1' } });
    const matchCards = [
      { position: 1, matchId: 'm1', designation: 'Main Event' },
      { position: 2, matchId: 'm2', designation: 'Co-Main' },
    ];
    mockUpdate.mockResolvedValue({ Attributes: { eventId: 'e1', matchCards } });
    const event = makeEvent({
      pathParameters: { eventId: 'e1' },
      body: JSON.stringify({ matchCards }),
    });

    const result = await updateEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockUpdate.mock.calls[0][0].ExpressionAttributeValues[':matchCards']).toEqual(matchCards);
  });

  it('updates fantasy budget and picks per division', async () => {
    mockGet.mockResolvedValue({ Item: { eventId: 'e1' } });
    mockUpdate.mockResolvedValue({
      Attributes: { eventId: 'e1', fantasyBudget: 1000, fantasyPicksPerDivision: 5 },
    });
    const event = makeEvent({
      pathParameters: { eventId: 'e1' },
      body: JSON.stringify({ fantasyBudget: 1000, fantasyPicksPerDivision: 5 }),
    });

    const result = await updateEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const call = mockUpdate.mock.calls[0][0];
    expect(call.ExpressionAttributeValues[':fantasyBudget']).toBe(1000);
    expect(call.ExpressionAttributeValues[':fantasyPicksPerDivision']).toBe(5);
  });

  it('accepts all valid status values', async () => {
    for (const status of ['upcoming', 'in-progress', 'completed', 'cancelled']) {
      vi.clearAllMocks();
      mockGet.mockResolvedValue({ Item: { eventId: 'e1' } });
      mockUpdate.mockResolvedValue({ Attributes: { eventId: 'e1', status } });
      const event = makeEvent({
        pathParameters: { eventId: 'e1' },
        body: JSON.stringify({ status }),
      });
      const result = await updateEvent(event, ctx, cb);
      expect(result!.statusCode).toBe(200);
    }
  });

  it('returns 500 when DynamoDB update fails', async () => {
    mockGet.mockResolvedValue({ Item: { eventId: 'e1' } });
    mockUpdate.mockRejectedValue(new Error('DynamoDB error'));
    const event = makeEvent({
      pathParameters: { eventId: 'e1' },
      body: JSON.stringify({ name: 'Updated' }),
    });

    const result = await updateEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to update event');
  });
});
