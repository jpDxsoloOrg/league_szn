import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Mocks ----------------------------------------------------------------

const {
  mockPlayersFindById,
  mockChampionshipsFindById,
  mockTournamentsFindById,
  mockSeasonsFindById,
  mockEventsFindById,
  mockEventsUpdate,
  mockMatchesCreate,
  mockChallengesFindById,
  mockChallengesUpdate,
  mockPromosFindById,
  mockPromosUpdate,
  mockStipulationsFindById,
} = vi.hoisted(() => ({
  mockPlayersFindById: vi.fn(),
  mockChampionshipsFindById: vi.fn(),
  mockTournamentsFindById: vi.fn(),
  mockSeasonsFindById: vi.fn(),
  mockEventsFindById: vi.fn(),
  mockEventsUpdate: vi.fn(),
  mockMatchesCreate: vi.fn(),
  mockChallengesFindById: vi.fn(),
  mockChallengesUpdate: vi.fn(),
  mockPromosFindById: vi.fn(),
  mockPromosUpdate: vi.fn(),
  mockStipulationsFindById: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    roster: {
      players: { findById: mockPlayersFindById },
    },
    competition: {
      championships: { findById: mockChampionshipsFindById },
      tournaments: { findById: mockTournamentsFindById },
      matches: { create: mockMatchesCreate },
      stipulations: { findById: mockStipulationsFindById },
    },
    season: {
      seasons: { findById: mockSeasonsFindById },
    },
    leagueOps: {
      events: { findById: mockEventsFindById, update: mockEventsUpdate },
    },
    user: {
      challenges: { findById: mockChallengesFindById, update: mockChallengesUpdate },
    },
    content: {
      promos: { findById: mockPromosFindById, update: mockPromosUpdate },
    },
  }),
}));

vi.mock('../../../lib/notifications', () => ({
  createNotifications: vi.fn().mockResolvedValue(undefined),
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
    stageVariables: null, resource: '', requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
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
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    mockMatchesCreate.mockResolvedValue({});
    const r = await scheduleMatch(ev({ body: validBody() }), ctx, cb);
    expect(r!.statusCode).toBe(201);
    const b = JSON.parse(r!.body);
    expect(b.matchId).toBe('test-uuid-match');
    expect(b.matchFormat).toBe('Singles');
    expect(b.participants).toEqual(['p1', 'p2']);
    expect(b.status).toBe('scheduled');
    expect(mockMatchesCreate).toHaveBeenCalledOnce();
  });

  it('sets stipulationId to undefined when not provided', async () => {
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    mockMatchesCreate.mockResolvedValue({});
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
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    const r = await scheduleMatch(ev({ body: validBody({ participants: ['p1', 'p1'] }) }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('Duplicate participants');
  });

  it('returns 404 when a participant does not exist', async () => {
    mockPlayersFindById
      .mockResolvedValueOnce({ playerId: 'p1' })
      .mockResolvedValueOnce(null);
    const r = await scheduleMatch(ev({ body: validBody() }), ctx, cb);
    expect(r!.statusCode).toBe(404);
    expect(JSON.parse(r!.body).message).toContain('p2');
  });

  it('returns 400 when isChampionship but no championshipId', async () => {
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    const r = await scheduleMatch(ev({ body: validBody({ isChampionship: true }) }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('Championship ID is required');
  });

  it('returns 404 when championshipId does not exist', async () => {
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    mockChampionshipsFindById.mockResolvedValue(null);
    const r = await scheduleMatch(ev({
      body: validBody({ isChampionship: true, championshipId: 'bad' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(404);
    expect(JSON.parse(r!.body).message).toContain('Championship not found');
  });

  it('returns 400 when championship division restriction violated', async () => {
    mockPlayersFindById
      .mockResolvedValueOnce({ playerId: 'p1', divisionId: 'div-1' })
      .mockResolvedValueOnce({ playerId: 'p2', divisionId: 'div-2' });
    mockChampionshipsFindById.mockResolvedValue({ championshipId: 'c1', divisionId: 'div-1' });
    const r = await scheduleMatch(ev({
      body: validBody({ isChampionship: true, championshipId: 'c1' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('not in the correct division');
  });

  it('returns 404 when tournamentId does not exist', async () => {
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    mockTournamentsFindById.mockResolvedValue(null);
    const r = await scheduleMatch(ev({ body: validBody({ tournamentId: 'bad' }) }), ctx, cb);
    expect(r!.statusCode).toBe(404);
    expect(JSON.parse(r!.body).message).toContain('Tournament not found');
  });

  it('returns 400 when tournament is completed', async () => {
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    mockTournamentsFindById.mockResolvedValue({ tournamentId: 't1', status: 'completed' });
    const r = await scheduleMatch(ev({ body: validBody({ tournamentId: 't1' }) }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('completed tournament');
  });

  it('returns 404 when seasonId does not exist', async () => {
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    mockSeasonsFindById.mockResolvedValue(null);
    const r = await scheduleMatch(ev({ body: validBody({ seasonId: 'bad' }) }), ctx, cb);
    expect(r!.statusCode).toBe(404);
    expect(JSON.parse(r!.body).message).toContain('Season not found');
  });

  it('returns 400 when season is not active', async () => {
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    mockSeasonsFindById.mockResolvedValue({ seasonId: 's1', status: 'ended' });
    const r = await scheduleMatch(ev({ body: validBody({ seasonId: 's1' }) }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('inactive season');
  });

  it('resolves date from event when date not provided', async () => {
    mockEventsFindById
      .mockResolvedValueOnce({ eventId: 'e1', date: '2024-07-04T00:00:00Z' })
      .mockResolvedValueOnce({ eventId: 'e1', matchCards: [] });
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    mockMatchesCreate.mockResolvedValue({});
    mockEventsUpdate.mockResolvedValue({});
    const r = await scheduleMatch(ev({
      body: JSON.stringify({ matchFormat: 'Singles', participants: ['p1', 'p2'], isChampionship: false, eventId: 'e1' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(201);
    expect(JSON.parse(r!.body).date).toBe('2024-07-04T00:00:00Z');
  });

  it('auto-adds match to event matchCards when eventId provided', async () => {
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    mockMatchesCreate.mockResolvedValue({});
    mockEventsFindById.mockResolvedValue({ eventId: 'e1', matchCards: [{ matchId: 'x' }] });
    mockEventsUpdate.mockResolvedValue({});
    const r = await scheduleMatch(ev({ body: validBody({ eventId: 'e1' }) }), ctx, cb);
    expect(r!.statusCode).toBe(201);
    expect(mockEventsUpdate).toHaveBeenCalledWith('e1', expect.objectContaining({
      matchCards: expect.arrayContaining([
        expect.objectContaining({ matchId: 'test-uuid-match', position: 2, designation: 'midcard' }),
      ]),
    }));
  });

  it('returns 500 on unexpected error', async () => {
    mockPlayersFindById.mockRejectedValue(new Error('Unexpected'));
    const r = await scheduleMatch(ev({ body: validBody() }), ctx, cb);
    expect(r!.statusCode).toBe(500);
    expect(JSON.parse(r!.body).message).toBe('Failed to schedule match');
  });

  it('includes challengeId and promoId on match when provided', async () => {
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    mockMatchesCreate.mockResolvedValue({});
    mockChallengesFindById.mockResolvedValue({ challengeId: 'ch1', status: 'accepted' });
    mockChallengesUpdate.mockResolvedValue({});
    mockPromosFindById.mockResolvedValue({ promoId: 'pr1' });
    mockPromosUpdate.mockResolvedValue({});
    const r = await scheduleMatch(ev({
      body: validBody({ challengeId: 'ch1', promoId: 'pr1' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(201);
    const b = JSON.parse(r!.body);
    expect(b.challengeId).toBe('ch1');
    expect(b.promoId).toBe('pr1');
  });

  it('updates challenge to scheduled when challengeId provided', async () => {
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    mockMatchesCreate.mockResolvedValue({});
    mockChallengesFindById.mockResolvedValue({ challengeId: 'ch1', status: 'accepted' });
    mockChallengesUpdate.mockResolvedValue({});
    const r = await scheduleMatch(ev({ body: validBody({ challengeId: 'ch1' }) }), ctx, cb);
    expect(r!.statusCode).toBe(201);
    expect(mockChallengesUpdate).toHaveBeenCalledWith('ch1', expect.objectContaining({
      status: 'scheduled',
      matchId: 'test-uuid-match',
    }));
  });

  it('updates promo to hidden when promoId provided', async () => {
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    mockMatchesCreate.mockResolvedValue({});
    mockPromosFindById.mockResolvedValue({ promoId: 'pr1' });
    mockPromosUpdate.mockResolvedValue({});
    const r = await scheduleMatch(ev({ body: validBody({ promoId: 'pr1' }) }), ctx, cb);
    expect(r!.statusCode).toBe(201);
    expect(mockPromosUpdate).toHaveBeenCalledWith('pr1', expect.objectContaining({
      isHidden: true,
      matchId: 'test-uuid-match',
    }));
  });
});
