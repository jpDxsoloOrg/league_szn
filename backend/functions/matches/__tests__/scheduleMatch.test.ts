import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Mocks ----------------------------------------------------------------

const { mockGet, mockPut, mockUpdate } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet,
    put: mockPut,
    scan: vi.fn(),
    query: vi.fn(),
    update: mockUpdate,
    delete: vi.fn(),
    scanAll: vi.fn(),
    queryAll: vi.fn(),
    transactWrite: vi.fn(),
  },
  TableNames: {
    MATCHES: 'Matches',
    PLAYERS: 'Players',
    CHAMPIONSHIPS: 'Championships',
    TOURNAMENTS: 'Tournaments',
    SEASONS: 'Seasons',
    EVENTS: 'Events',
    STIPULATIONS: 'Stipulations',
    CHALLENGES: 'Challenges',
    PROMOS: 'Promos',
  },
}));

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-match',
}));

import { handler as scheduleMatch } from '../scheduleMatch';

// ---- Helpers ---------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};

function ev(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'POST',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '', requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    matchFormat: 'Singles', participants: ['p1', 'p2'],
    isChampionship: false, date: '2024-06-01T00:00:00Z', ...overrides,
  });
}

// ---- Tests -----------------------------------------------------------------

describe('scheduleMatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a match with valid data and returns 201', async () => {
    mockGet.mockResolvedValue({ Item: { playerId: 'p1' } });
    mockPut.mockResolvedValue({});
    const r = await scheduleMatch(ev({ body: validBody() }), ctx, cb);
    expect(r!.statusCode).toBe(201);
    const b = JSON.parse(r!.body);
    expect(b.matchId).toBe('test-uuid-match');
    expect(b.matchFormat).toBe('Singles');
    expect(b.participants).toEqual(['p1', 'p2']);
    expect(b.status).toBe('scheduled');
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it('sets stipulationId to undefined when not provided', async () => {
    mockGet.mockResolvedValue({ Item: { playerId: 'p1' } });
    mockPut.mockResolvedValue({});
    const r = await scheduleMatch(ev({ body: validBody({ stipulationId: undefined }) }), ctx, cb);
    expect(r!.statusCode).toBe(201);
    expect(JSON.parse(r!.body).stipulationId).toBeUndefined();
  });

  it('returns 400 when body is null', async () => {
    const r = await scheduleMatch(ev({ body: null }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toBe('Request body is required');
  });

  it('returns 400 for invalid JSON', async () => {
    const r = await scheduleMatch(ev({ body: '{bad json' }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 400 when matchFormat is missing', async () => {
    const r = await scheduleMatch(ev({
      body: JSON.stringify({ participants: ['p1', 'p2'], isChampionship: false }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('matchFormat');
  });

  it('returns 400 when fewer than 2 participants', async () => {
    const r = await scheduleMatch(ev({
      body: JSON.stringify({ matchFormat: 'Singles', participants: ['p1'], isChampionship: false }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('at least 2 participants');
  });

  it('returns 400 when duplicate participants are provided', async () => {
    mockGet.mockResolvedValue({ Item: { playerId: 'p1' } });
    const r = await scheduleMatch(ev({ body: validBody({ participants: ['p1', 'p1'] }) }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('Duplicate participants');
  });

  it('returns 404 when a participant does not exist', async () => {
    mockGet
      .mockResolvedValueOnce({ Item: { playerId: 'p1' } })
      .mockResolvedValueOnce({ Item: undefined });
    const r = await scheduleMatch(ev({ body: validBody() }), ctx, cb);
    expect(r!.statusCode).toBe(404);
    expect(JSON.parse(r!.body).message).toContain('p2');
  });

  it('returns 400 when isChampionship but no championshipId', async () => {
    mockGet.mockResolvedValue({ Item: { playerId: 'p1' } });
    const r = await scheduleMatch(ev({ body: validBody({ isChampionship: true }) }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('Championship ID is required');
  });

  it('returns 404 when championshipId does not exist', async () => {
    mockGet
      .mockResolvedValueOnce({ Item: { playerId: 'p1' } })
      .mockResolvedValueOnce({ Item: { playerId: 'p2' } })
      .mockResolvedValueOnce({ Item: undefined });
    const r = await scheduleMatch(ev({
      body: validBody({ isChampionship: true, championshipId: 'bad' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(404);
    expect(JSON.parse(r!.body).message).toContain('Championship not found');
  });

  it('returns 400 when championship division restriction violated', async () => {
    mockGet
      .mockResolvedValueOnce({ Item: { playerId: 'p1', divisionId: 'div-1' } })
      .mockResolvedValueOnce({ Item: { playerId: 'p2', divisionId: 'div-2' } })
      .mockResolvedValueOnce({ Item: { championshipId: 'c1', divisionId: 'div-1' } });
    const r = await scheduleMatch(ev({
      body: validBody({ isChampionship: true, championshipId: 'c1' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('not in the correct division');
  });

  it('returns 404 when tournamentId does not exist', async () => {
    mockGet
      .mockResolvedValueOnce({ Item: { playerId: 'p1' } })
      .mockResolvedValueOnce({ Item: { playerId: 'p2' } })
      .mockResolvedValueOnce({ Item: undefined });
    const r = await scheduleMatch(ev({ body: validBody({ tournamentId: 'bad' }) }), ctx, cb);
    expect(r!.statusCode).toBe(404);
    expect(JSON.parse(r!.body).message).toContain('Tournament not found');
  });

  it('returns 400 when tournament is completed', async () => {
    mockGet
      .mockResolvedValueOnce({ Item: { playerId: 'p1' } })
      .mockResolvedValueOnce({ Item: { playerId: 'p2' } })
      .mockResolvedValueOnce({ Item: { tournamentId: 't1', status: 'completed' } });
    const r = await scheduleMatch(ev({ body: validBody({ tournamentId: 't1' }) }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('completed tournament');
  });

  it('returns 404 when seasonId does not exist', async () => {
    mockGet
      .mockResolvedValueOnce({ Item: { playerId: 'p1' } })
      .mockResolvedValueOnce({ Item: { playerId: 'p2' } })
      .mockResolvedValueOnce({ Item: undefined });
    const r = await scheduleMatch(ev({ body: validBody({ seasonId: 'bad' }) }), ctx, cb);
    expect(r!.statusCode).toBe(404);
    expect(JSON.parse(r!.body).message).toContain('Season not found');
  });

  it('returns 400 when season is not active', async () => {
    mockGet
      .mockResolvedValueOnce({ Item: { playerId: 'p1' } })
      .mockResolvedValueOnce({ Item: { playerId: 'p2' } })
      .mockResolvedValueOnce({ Item: { seasonId: 's1', status: 'ended' } });
    const r = await scheduleMatch(ev({ body: validBody({ seasonId: 's1' }) }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('inactive season');
  });

  it('resolves date from event when date not provided', async () => {
    // Call order: 1) event for date resolution, 2) player p1, 3) player p2, 4) event for matchCards
    mockGet
      .mockResolvedValueOnce({ Item: { eventId: 'e1', date: '2024-07-04T00:00:00Z' } })
      .mockResolvedValueOnce({ Item: { playerId: 'p1' } })
      .mockResolvedValueOnce({ Item: { playerId: 'p2' } })
      .mockResolvedValueOnce({ Item: { eventId: 'e1', matchCards: [] } });
    mockPut.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});
    const r = await scheduleMatch(ev({
      body: JSON.stringify({ matchFormat: 'Singles', participants: ['p1', 'p2'], isChampionship: false, eventId: 'e1' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(201);
    expect(JSON.parse(r!.body).date).toBe('2024-07-04T00:00:00Z');
  });

  it('auto-adds match to event matchCards when eventId provided', async () => {
    mockGet
      .mockResolvedValueOnce({ Item: { playerId: 'p1' } })
      .mockResolvedValueOnce({ Item: { playerId: 'p2' } })
      .mockResolvedValueOnce({ Item: { eventId: 'e1', matchCards: [{ matchId: 'x' }] } });
    mockPut.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});
    const r = await scheduleMatch(ev({ body: validBody({ eventId: 'e1' }) }), ctx, cb);
    expect(r!.statusCode).toBe(201);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ Key: { eventId: 'e1' } }));
    const card = mockUpdate.mock.calls[0][0].ExpressionAttributeValues[':newCard'][0];
    expect(card.position).toBe(2);
    expect(card.designation).toBe('midcard');
  });

  it('returns 500 on unexpected error', async () => {
    mockGet.mockRejectedValue(new Error('Unexpected'));
    const r = await scheduleMatch(ev({ body: validBody() }), ctx, cb);
    expect(r!.statusCode).toBe(500);
    expect(JSON.parse(r!.body).message).toBe('Failed to schedule match');
  });

  it('includes challengeId and promoId on match when provided', async () => {
    mockGet
      .mockResolvedValueOnce({ Item: { playerId: 'p1' } })
      .mockResolvedValueOnce({ Item: { playerId: 'p2' } })
      .mockResolvedValueOnce({ Item: { challengeId: 'ch1', status: 'accepted' } })
      .mockResolvedValueOnce({ Item: { promoId: 'pr1' } });
    mockPut.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});
    const r = await scheduleMatch(ev({
      body: validBody({ challengeId: 'ch1', promoId: 'pr1' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(201);
    const b = JSON.parse(r!.body);
    expect(b.challengeId).toBe('ch1');
    expect(b.promoId).toBe('pr1');
  });

  it('updates challenge to scheduled when challengeId provided', async () => {
    mockGet
      .mockResolvedValueOnce({ Item: { playerId: 'p1' } })
      .mockResolvedValueOnce({ Item: { playerId: 'p2' } })
      .mockResolvedValueOnce({ Item: { challengeId: 'ch1', status: 'accepted' } });
    mockPut.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});
    const r = await scheduleMatch(ev({ body: validBody({ challengeId: 'ch1' }) }), ctx, cb);
    expect(r!.statusCode).toBe(201);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'Challenges',
        Key: { challengeId: 'ch1' },
      })
    );
    const values = mockUpdate.mock.calls[0][0].ExpressionAttributeValues;
    expect(values[':status']).toBe('scheduled');
    expect(values[':matchId']).toBe('test-uuid-match');
  });

  it('updates promo to hidden when promoId provided', async () => {
    mockGet
      .mockResolvedValueOnce({ Item: { playerId: 'p1' } })
      .mockResolvedValueOnce({ Item: { playerId: 'p2' } })
      .mockResolvedValueOnce({ Item: { promoId: 'pr1' } });
    mockPut.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});
    const r = await scheduleMatch(ev({ body: validBody({ promoId: 'pr1' }) }), ctx, cb);
    expect(r!.statusCode).toBe(201);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'Promos',
        Key: { promoId: 'pr1' },
      })
    );
    const values = mockUpdate.mock.calls[0][0].ExpressionAttributeValues;
    expect(values[':hidden']).toBe(true);
    expect(values[':matchId']).toBe('test-uuid-match');
  });
});
