import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Mocks ----------------------------------------------------------------

const mockFantasyRepo = {
  getConfig: vi.fn(),
  upsertConfig: vi.fn(),
  findPick: vi.fn(),
  listPicksByEvent: vi.fn(),
  listPicksByUser: vi.fn(),
  listAllPicks: vi.fn(),
  savePick: vi.fn(),
  updatePickScoring: vi.fn(),
  deletePick: vi.fn(),
  findCost: vi.fn(),
  listAllCosts: vi.fn(),
  upsertCost: vi.fn(),
  initializeCost: vi.fn(),
};

const mockEventsRepo = {
  findById: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    user: {
      fantasy: mockFantasyRepo,
    },
    leagueOps: {
      events: mockEventsRepo,
    },
  }),
}));

import { handler as clearPicks } from '../clearPicks';
import { handler as getAllMyPicks } from '../getAllMyPicks';
import { handler as getUserPicks } from '../getUserPicks';

// ---- Helpers ---------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {},
    httpMethod: 'GET', isBase64Encoded: false, path: '/',
    pathParameters: null, queryStringParameters: null,
    multiValueQueryStringParameters: null, stageVariables: null,
    resource: '', requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

function withAuth(event: APIGatewayProxyEvent, groups = 'Fantasy', sub = 'user-1'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: sub },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

// ---- clearPicks ------------------------------------------------------------

describe('clearPicks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when user lacks Fantasy role', async () => {
    const event = withAuth(makeEvent({ pathParameters: { eventId: 'e1' } }), '');
    const result = await clearPicks(event, ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('returns 400 when eventId is missing', async () => {
    const event = withAuth(makeEvent({ pathParameters: null }));
    const result = await clearPicks(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Event ID is required');
  });

  it('returns 404 when event does not exist', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce(null);

    const event = withAuth(makeEvent({ pathParameters: { eventId: 'e1' } }));
    const result = await clearPicks(event, ctx, cb);
    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Event not found');
  });

  it('returns 400 when event is completed', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({ eventId: 'e1', status: 'completed' });

    const event = withAuth(makeEvent({ pathParameters: { eventId: 'e1' } }));
    const result = await clearPicks(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Cannot clear picks for a completed event');
  });

  it('returns 400 when picks are locked', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({
      eventId: 'e1', status: 'scheduled', fantasyLocked: true,
    });

    const event = withAuth(makeEvent({ pathParameters: { eventId: 'e1' } }));
    const result = await clearPicks(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Picks are locked for this event');
  });

  it('deletes user picks and returns 204', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({
      eventId: 'e1', status: 'scheduled',
    });
    mockFantasyRepo.deletePick.mockResolvedValueOnce(undefined);

    const event = withAuth(makeEvent({ pathParameters: { eventId: 'e1' } }));
    const result = await clearPicks(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    expect(mockFantasyRepo.deletePick).toHaveBeenCalledWith('e1', 'user-1');
  });

  it('returns 500 on unexpected error', async () => {
    mockEventsRepo.findById.mockRejectedValueOnce(new Error('DynamoDB failure'));

    const event = withAuth(makeEvent({ pathParameters: { eventId: 'e1' } }));
    const result = await clearPicks(event, ctx, cb);
    expect(result!.statusCode).toBe(500);
  });
});

// ---- getAllMyPicks ----------------------------------------------------------

describe('getAllMyPicks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when user lacks Fantasy role', async () => {
    const event = withAuth(makeEvent(), '');
    const result = await getAllMyPicks(event, ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('returns user picks sorted by eventId descending', async () => {
    mockFantasyRepo.listPicksByUser.mockResolvedValueOnce([
      { eventId: 'event-003', fantasyUserId: 'user-1' },
      { eventId: 'event-002', fantasyUserId: 'user-1' },
      { eventId: 'event-001', fantasyUserId: 'user-1' },
    ]);

    const event = withAuth(makeEvent());
    const result = await getAllMyPicks(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(3);
    expect(body[0].eventId).toBe('event-003');
    expect(body[1].eventId).toBe('event-002');
    expect(body[2].eventId).toBe('event-001');
  });

  it('returns empty array when user has no picks', async () => {
    mockFantasyRepo.listPicksByUser.mockResolvedValueOnce([]);

    const event = withAuth(makeEvent());
    const result = await getAllMyPicks(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([]);
  });

  it('calls listPicksByUser with correct fantasyUserId', async () => {
    mockFantasyRepo.listPicksByUser.mockResolvedValueOnce([]);

    const event = withAuth(makeEvent(), 'Fantasy', 'my-sub');
    await getAllMyPicks(event, ctx, cb);

    expect(mockFantasyRepo.listPicksByUser).toHaveBeenCalledWith('my-sub');
  });

  it('returns 500 on unexpected error', async () => {
    mockFantasyRepo.listPicksByUser.mockRejectedValueOnce(new Error('DynamoDB failure'));

    const event = withAuth(makeEvent());
    const result = await getAllMyPicks(event, ctx, cb);
    expect(result!.statusCode).toBe(500);
  });
});

// ---- getUserPicks ----------------------------------------------------------

describe('getUserPicks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when user lacks Fantasy role', async () => {
    const event = withAuth(makeEvent({ pathParameters: { eventId: 'e1' } }), '');
    const result = await getUserPicks(event, ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('returns 400 when eventId is missing', async () => {
    const event = withAuth(makeEvent({ pathParameters: null }));
    const result = await getUserPicks(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Event ID is required');
  });

  it('returns 404 when no picks found for event', async () => {
    mockFantasyRepo.findPick.mockResolvedValueOnce(null);

    const event = withAuth(makeEvent({ pathParameters: { eventId: 'e1' } }));
    const result = await getUserPicks(event, ctx, cb);
    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('No picks found for this event');
  });

  it('returns picks for the event', async () => {
    const pickData = { eventId: 'e1', fantasyUserId: 'user-1', picks: { d1: ['p1'] } };
    mockFantasyRepo.findPick.mockResolvedValueOnce(pickData);

    const event = withAuth(makeEvent({ pathParameters: { eventId: 'e1' } }));
    const result = await getUserPicks(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual(pickData);
  });

  it('uses fantasyUserId from auth context', async () => {
    mockFantasyRepo.findPick.mockResolvedValueOnce({ eventId: 'e1' });

    const event = withAuth(makeEvent({ pathParameters: { eventId: 'e1' } }), 'Fantasy', 'my-sub');
    await getUserPicks(event, ctx, cb);

    expect(mockFantasyRepo.findPick).toHaveBeenCalledWith('e1', 'my-sub');
  });

  it('returns 500 on unexpected error', async () => {
    mockFantasyRepo.findPick.mockRejectedValueOnce(new Error('DynamoDB failure'));

    const event = withAuth(makeEvent({ pathParameters: { eventId: 'e1' } }));
    const result = await getUserPicks(event, ctx, cb);
    expect(result!.statusCode).toBe(500);
  });
});
