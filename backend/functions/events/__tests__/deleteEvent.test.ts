import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockGet, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet, put: vi.fn(), scan: vi.fn(), query: vi.fn(),
    update: vi.fn(), delete: mockDelete, scanAll: vi.fn(), queryAll: vi.fn(),
  },
  TableNames: { EVENTS: 'Events', MATCHES: 'Matches' },
}));

import { handler as deleteEvent } from '../deleteEvent';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'DELETE',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: {} } as any, ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('deleteEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when eventId path parameter is missing', async () => {
    const result = await deleteEvent(makeEvent({ pathParameters: null }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Event ID is required');
  });

  it('returns 404 when event does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    const event = makeEvent({ pathParameters: { eventId: 'nonexistent' } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Event not found');
  });

  it('deletes event with empty matchCards and returns 204', async () => {
    mockGet.mockResolvedValue({
      Item: { eventId: 'e1', name: 'Test', matchCards: [] },
    });
    mockDelete.mockResolvedValue({});
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith(
      expect.objectContaining({ Key: { eventId: 'e1' } })
    );
  });

  it('deletes event when matchCards property is undefined', async () => {
    mockGet.mockResolvedValue({ Item: { eventId: 'e1', name: 'Test' } });
    mockDelete.mockResolvedValue({});
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
  });

  it('deletes event when matchCards have no matchId values', async () => {
    mockGet.mockResolvedValue({
      Item: { eventId: 'e1', matchCards: [{ position: 1, designation: 'TBD' }] },
    });
    mockDelete.mockResolvedValue({});
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
  });

  it('deletes event when associated matches are not completed', async () => {
    mockGet
      .mockResolvedValueOnce({
        Item: {
          eventId: 'e1',
          matchCards: [
            { position: 1, matchId: 'm1', designation: 'Main Event' },
            { position: 2, matchId: 'm2', designation: 'Opener' },
          ],
        },
      })
      .mockResolvedValueOnce({ Item: { matchId: 'm1', status: 'scheduled' } })
      .mockResolvedValueOnce({ Item: { matchId: 'm2', status: 'in-progress' } });
    mockDelete.mockResolvedValue({});
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    expect(mockDelete).toHaveBeenCalledOnce();
  });

  it('returns 409 when event has a completed match', async () => {
    mockGet
      .mockResolvedValueOnce({
        Item: {
          eventId: 'e1',
          matchCards: [{ position: 1, matchId: 'm1', designation: 'Main Event' }],
        },
      })
      .mockResolvedValueOnce({ Item: { matchId: 'm1', status: 'completed' } });
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(409);
    expect(JSON.parse(result!.body).message).toContain('Cannot delete event');
    expect(JSON.parse(result!.body).message).toContain('1 completed match(es)');
  });

  it('returns 409 with correct count for multiple completed matches', async () => {
    mockGet
      .mockResolvedValueOnce({
        Item: {
          eventId: 'e1',
          matchCards: [
            { position: 1, matchId: 'm1', designation: 'Main' },
            { position: 2, matchId: 'm2', designation: 'Co-Main' },
            { position: 3, matchId: 'm3', designation: 'Opener' },
          ],
        },
      })
      .mockResolvedValueOnce({ Item: { matchId: 'm1', status: 'completed' } })
      .mockResolvedValueOnce({ Item: { matchId: 'm2', status: 'completed' } })
      .mockResolvedValueOnce({ Item: { matchId: 'm3', status: 'scheduled' } });
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(409);
    expect(JSON.parse(result!.body).message).toContain('2 completed match(es)');
  });

  it('allows deletion when match lookup returns no Item', async () => {
    mockGet
      .mockResolvedValueOnce({
        Item: {
          eventId: 'e1',
          matchCards: [{ position: 1, matchId: 'm-deleted', designation: 'Match' }],
        },
      })
      .mockResolvedValueOnce({ Item: undefined });
    mockDelete.mockResolvedValue({});
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
  });

  it('returns 500 when DynamoDB fails', async () => {
    mockGet.mockRejectedValue(new Error('DynamoDB error'));
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to delete event');
  });
});
