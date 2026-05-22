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
  mockRivalriesGet,
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
  mockRivalriesGet: vi.fn(),
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
    rivalries: { get: mockRivalriesGet },
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

// ---- Slot-mode (MSL-01) ----------------------------------------------------

function slotBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    matchFormat: 'Singles',
    isChampionship: false,
    date: '2024-06-01T00:00:00Z',
    slotsRequired: 2,
    slots: [
      { position: 1 },
      { position: 2 },
    ],
    ...overrides,
  });
}

describe('scheduleMatch (slot-mode)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an open-signups match when all slots are open', async () => {
    mockMatchesCreate.mockResolvedValue({});
    const r = await scheduleMatch(ev({ body: slotBody() }), ctx, cb);
    expect(r!.statusCode).toBe(201);
    const b = JSON.parse(r!.body);
    expect(b.status).toBe('open-signups');
    expect(b.participants).toEqual([]);
    expect(b.slotsRequired).toBe(2);
    expect(b.slots).toHaveLength(2);
    expect(b.slots[0].position).toBe(1);
    expect(b.slots[0].playerId).toBeUndefined();
    expect(typeof b.slots[0].slotId).toBe('string');
    // No player lookups needed when all slots open
    expect(mockPlayersFindById).not.toHaveBeenCalled();
  });

  it('creates a scheduled match when all slots are pre-filled', async () => {
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    mockMatchesCreate.mockResolvedValue({});
    const r = await scheduleMatch(ev({
      body: slotBody({
        slots: [
          { position: 1, playerId: 'p1' },
          { position: 2, playerId: 'p2' },
        ],
      }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(201);
    const b = JSON.parse(r!.body);
    expect(b.status).toBe('scheduled');
    expect(b.participants).toEqual(['p1', 'p2']);
    expect(b.slots[0].playerId).toBe('p1');
    expect(b.slots[0].claimedAt).toBeDefined();
  });

  it('creates an open-signups match when some slots are pre-filled and some open (mixed)', async () => {
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    mockMatchesCreate.mockResolvedValue({});
    const r = await scheduleMatch(ev({
      body: slotBody({
        slotsRequired: 3,
        slots: [
          { position: 1, playerId: 'p1', lockedByAdmin: true },
          { position: 2 },
          { position: 3 },
        ],
      }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(201);
    const b = JSON.parse(r!.body);
    expect(b.status).toBe('open-signups');
    expect(b.participants).toEqual(['p1']);
    expect(b.slots[0].lockedByAdmin).toBe(true);
    expect(b.slots[1].playerId).toBeUndefined();
  });

  it('rejects mixed payload (slots + participants)', async () => {
    const r = await scheduleMatch(ev({
      body: JSON.stringify({
        matchFormat: 'Singles',
        isChampionship: false,
        date: '2024-06-01T00:00:00Z',
        slotsRequired: 2,
        slots: [{ position: 1 }, { position: 2 }],
        participants: ['p1', 'p2'],
      }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('mix');
  });

  it('rejects duplicate playerId across slots', async () => {
    const r = await scheduleMatch(ev({
      body: slotBody({
        slots: [
          { position: 1, playerId: 'p1' },
          { position: 2, playerId: 'p1' },
        ],
      }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('Duplicate playerId');
  });

  it('rejects non-contiguous slot positions', async () => {
    const r = await scheduleMatch(ev({
      body: slotBody({
        slots: [
          { position: 1 },
          { position: 3 },
        ],
      }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('1..N contiguous');
  });

  it('rejects when slots length does not match slotsRequired', async () => {
    const r = await scheduleMatch(ev({
      body: slotBody({
        slotsRequired: 3,
        slots: [{ position: 1 }, { position: 2 }],
      }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('slots length must equal');
  });

  it('rejects when slotsRequired < 2', async () => {
    const r = await scheduleMatch(ev({
      body: slotBody({ slotsRequired: 1, slots: [{ position: 1 }] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('>= 2');
  });

  it('enforces championship division on a pre-filled slot', async () => {
    mockPlayersFindById.mockImplementation(async (id: string) => {
      if (id === 'p1') return { playerId: 'p1', divisionId: 'div-A' };
      if (id === 'p2') return { playerId: 'p2', divisionId: 'div-B' };
      return null;
    });
    mockChampionshipsFindById.mockResolvedValue({
      championshipId: 'c1',
      divisionId: 'div-A',
    });
    const r = await scheduleMatch(ev({
      body: slotBody({
        isChampionship: true,
        championshipId: 'c1',
        slots: [
          { position: 1, playerId: 'p1' },
          { position: 2, playerId: 'p2' },
        ],
      }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('division');
  });
});

describe('scheduleMatch (rivalryId — RIV-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayersFindById.mockImplementation(async (id: string) => ({
      playerId: id, name: id, divisionId: undefined,
    }));
    mockMatchesCreate.mockResolvedValue(undefined);
  });

  it('persists rivalryId when both match participants are in the rivalry', async () => {
    mockRivalriesGet.mockResolvedValueOnce({
      rivalryId: 'r1',
      participants: [
        { playerId: 'p1', role: 'instigator', addedAt: '' },
        { playerId: 'p2', role: 'rival', addedAt: '' },
      ],
    });

    const r = await scheduleMatch(ev({
      body: validBody({ rivalryId: 'r1' }),
    }), ctx, cb);

    expect(r!.statusCode).toBe(201);
    expect(mockMatchesCreate).toHaveBeenCalledTimes(1);
    expect(mockMatchesCreate.mock.calls[0][0].rivalryId).toBe('r1');
  });

  it('returns 400 when rivalryId does not include both match participants', async () => {
    mockRivalriesGet.mockResolvedValueOnce({
      rivalryId: 'r1',
      participants: [
        { playerId: 'p99', role: 'instigator', addedAt: '' },
        { playerId: 'p98', role: 'rival', addedAt: '' },
      ],
    });

    const r = await scheduleMatch(ev({
      body: validBody({ rivalryId: 'r1' }),
    }), ctx, cb);

    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('Rivalry');
    expect(mockMatchesCreate).not.toHaveBeenCalled();
  });

  it('returns 404 when rivalryId does not exist', async () => {
    mockRivalriesGet.mockResolvedValueOnce(undefined);

    const r = await scheduleMatch(ev({
      body: validBody({ rivalryId: 'ghost' }),
    }), ctx, cb);

    expect(r!.statusCode).toBe(404);
    expect(mockMatchesCreate).not.toHaveBeenCalled();
  });

  it('is a no-op when rivalryId is omitted (backwards compat)', async () => {
    const r = await scheduleMatch(ev({ body: validBody() }), ctx, cb);

    expect(r!.statusCode).toBe(201);
    expect(mockRivalriesGet).not.toHaveBeenCalled();
    expect(mockMatchesCreate.mock.calls[0][0].rivalryId).toBeUndefined();
  });
});
