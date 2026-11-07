import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const mockChallengesRepo = {
  findById: vi.fn(),
  list: vi.fn(),
  listByStatus: vi.fn(),
  listByChallenger: vi.fn(),
  listByChallenged: vi.fn(),
  listByPlayer: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateIfStatus: vi.fn(),
  delete: vi.fn(),
};

const mockPlayersRepo = {
  findById: vi.fn(),
  findByUserId: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

const mockTagTeamsRepo = {
  findById: vi.fn(),
  list: vi.fn(),
  listByStatus: vi.fn(),
  listByPlayer: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

const mockChampionshipsRepo = { findById: vi.fn() };

const mockRunInTransaction = vi.fn();

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    user: {
      challenges: mockChallengesRepo,
    },
    roster: {
      players: mockPlayersRepo,
      tagTeams: mockTagTeamsRepo,
    },
    competition: {
      championships: mockChampionshipsRepo,
    },
    runInTransaction: mockRunInTransaction,
  }),
}));

vi.mock('uuid', () => ({ v4: () => 'counter-uuid-5678' }));

import { handler as respondToChallenge } from '../respondToChallenge';

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

function withAuth(event: APIGatewayProxyEvent, groups: string, sub = 'user-sub-2'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'challenged-user', email: 'c@test.com', principalId: sub },
    } as any,
  };
}

function respondEvent(body: object) {
  return withAuth(makeEvent({ pathParameters: { challengeId: 'ch1' }, body: JSON.stringify(body) }), 'Wrestler');
}

const pendingChallenge = {
  challengeId: 'ch1', challengerId: 'p1', challengedId: 'p2',
  matchType: 'Singles', status: 'pending', createdAt: '2025-01-15T10:00:00.000Z',
  expiresAt: '2025-01-22T10:00:00.000Z', updatedAt: '2025-01-15T10:00:00.000Z',
};

/** Set up mocks so the challenged player (p2) is the responder */
function setupValidResponder() {
  mockChallengesRepo.findById.mockResolvedValue(pendingChallenge);
  mockPlayersRepo.findByUserId.mockResolvedValue({ playerId: 'p2', userId: 'user-sub-2', name: 'P2', currentWrestler: 'W2', wins: 0, losses: 0, draws: 0, createdAt: '', updatedAt: '' });
}

// ─── respondToChallenge ─────────────────────────────────────────────

describe('respondToChallenge', () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    vi.clearAllMocks();
    // Keep the dated fixture inside its response window.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2025-01-16T10:00:00.000Z') });
    mockRunInTransaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx = {
        updateChallenge: vi.fn(),
        createChallenge: vi.fn(),
      };
      await fn(tx);
    });
  });

  it('returns 403 when user does not have Wrestler role', async () => {
    const event = withAuth(makeEvent({ pathParameters: { challengeId: 'ch1' }, body: JSON.stringify({ action: 'accept' }) }), 'Fantasy');
    const result = await respondToChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toBe('Only wrestlers can respond to challenges');
  });

  it('returns 400 when challengeId is missing from path', async () => {
    const event = withAuth(makeEvent({ body: JSON.stringify({ action: 'accept' }) }), 'Wrestler');
    const result = await respondToChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('challengeId is required');
  });

  it('returns 400 when request body is missing', async () => {
    const event = withAuth(makeEvent({ pathParameters: { challengeId: 'ch1' }, body: null }), 'Wrestler');
    const result = await respondToChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 when request body is invalid JSON', async () => {
    const event = withAuth(makeEvent({ pathParameters: { challengeId: 'ch1' }, body: '{bad' }), 'Wrestler');
    const result = await respondToChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 400 when action is missing or invalid', async () => {
    const r1 = await respondToChallenge(respondEvent({}), ctx, cb);
    expect(r1!.statusCode).toBe(400);
    expect(JSON.parse(r1!.body).message).toBe('action must be accept, decline, or counter');

    vi.clearAllMocks();
    const r2 = await respondToChallenge(respondEvent({ action: 'destroy' }), ctx, cb);
    expect(r2!.statusCode).toBe(400);
  });

  it('returns 404 when challenge does not exist', async () => {
    mockChallengesRepo.findById.mockResolvedValue(null);
    const result = await respondToChallenge(respondEvent({ action: 'accept' }), ctx, cb);
    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Challenge not found');
  });

  it('returns 400 when challenge is no longer pending', async () => {
    mockChallengesRepo.findById.mockResolvedValue({ ...pendingChallenge, status: 'accepted' });
    const result = await respondToChallenge(respondEvent({ action: 'accept' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Challenge is no longer pending');
  });

  it('returns 403 when responder is not the challenged player', async () => {
    mockChallengesRepo.findById.mockResolvedValue(pendingChallenge);
    mockPlayersRepo.findByUserId.mockResolvedValue({ playerId: 'p3', userId: 'user-sub-2', name: 'P3', currentWrestler: 'W3', wins: 0, losses: 0, draws: 0, createdAt: '', updatedAt: '' });
    const result = await respondToChallenge(respondEvent({ action: 'accept' }), ctx, cb);
    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toBe('Only the challenged player can respond');
  });

  it('returns 403 when responder has no player profile', async () => {
    mockChallengesRepo.findById.mockResolvedValue(pendingChallenge);
    mockPlayersRepo.findByUserId.mockResolvedValue(null);
    const result = await respondToChallenge(respondEvent({ action: 'accept' }), ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('accepts a challenge and updates status to accepted', async () => {
    setupValidResponder();
    mockChallengesRepo.updateIfStatus.mockResolvedValue(true);
    const result = await respondToChallenge(respondEvent({ action: 'accept' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.status).toBe('accepted');
    expect(body.updatedAt).toBeDefined();
    expect(mockChallengesRepo.updateIfStatus).toHaveBeenCalledWith('ch1', { status: 'accepted' }, 'pending');
  });

  it('accepts with responseMessage', async () => {
    setupValidResponder();
    mockChallengesRepo.updateIfStatus.mockResolvedValue(true);
    const result = await respondToChallenge(respondEvent({ action: 'accept', responseMessage: 'Bring it!' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).responseMessage).toBe('Bring it!');
    expect(mockChallengesRepo.updateIfStatus).toHaveBeenCalledWith('ch1', { status: 'accepted', responseMessage: 'Bring it!' }, 'pending');
  });

  it('declines a challenge and updates status to declined', async () => {
    setupValidResponder();
    mockChallengesRepo.updateIfStatus.mockResolvedValue(true);
    const result = await respondToChallenge(respondEvent({ action: 'decline' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).status).toBe('declined');
    expect(mockChallengesRepo.updateIfStatus).toHaveBeenCalledOnce();
  });

  it('returns 400 when countering without counterMatchType', async () => {
    setupValidResponder();
    const result = await respondToChallenge(respondEvent({ action: 'counter' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('counterMatchType is required when countering');
  });

  it('counters a challenge using UoW creating a new reversed challenge', async () => {
    setupValidResponder();

    const result = await respondToChallenge(respondEvent({
      action: 'counter', counterMatchType: 'Cage', counterStipulation: 'Steel Cage',
      counterMessage: 'My terms!', responseMessage: 'Not good enough',
    }), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.original.status).toBe('countered');
    expect(body.original.counteredChallengeId).toBe('counter-uuid-5678');
    expect(body.original.responseMessage).toBe('Not good enough');
    expect(body.counter.challengerId).toBe('p2');
    expect(body.counter.challengedId).toBe('p1');
    expect(body.counter.matchType).toBe('Cage');
    expect(body.counter.stipulation).toBe('Steel Cage');
    expect(body.counter.message).toBe('My terms!');
    expect(body.counter.status).toBe('pending');
    expect(body.counter.expiresAt).toBeDefined();
    expect(mockRunInTransaction).toHaveBeenCalledOnce();
  });

  it('counters without optional counterStipulation and counterMessage', async () => {
    setupValidResponder();
    const result = await respondToChallenge(respondEvent({ action: 'counter', counterMatchType: 'TLC' }), ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.counter.matchType).toBe('TLC');
    expect(body.counter.stipulation).toBeUndefined();
    expect(body.counter.message).toBeUndefined();
  });

  describe('countering a title challenge', () => {
    const titleChallenge = { ...pendingChallenge, championshipId: 'world' };
    const worldTitle = { championshipId: 'world', name: 'World Title', type: 'singles', currentChampion: 'p2', isActive: true };

    function setupTitleCounter() {
      setupValidResponder();
      mockChallengesRepo.findById.mockResolvedValue(titleChallenge);
      mockPlayersRepo.findById.mockResolvedValue({ playerId: 'p1', currentWrestler: 'W1' });
      mockChampionshipsRepo.findById.mockResolvedValue(worldTitle);
    }

    it('keeps the title on the line', async () => {
      setupTitleCounter();
      const result = await respondToChallenge(respondEvent({ action: 'counter', counterMatchType: 'Ladder' }), ctx, cb);
      expect(result!.statusCode).toBe(200);
      expect(JSON.parse(result!.body).counter.championshipId).toBe('world');
    });

    it('rejects a counter match type that does not suit the title', async () => {
      setupTitleCounter();
      const result = await respondToChallenge(respondEvent({ action: 'counter', counterMatchType: 'Tag Team' }), ctx, cb);
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('A singles title cannot be decided in a tag team match');
      expect(mockRunInTransaction).not.toHaveBeenCalled();
    });

    it('keeps a tag title on the line when the title belongs to a team in the challenge', async () => {
      setupTitleCounter();
      mockChallengesRepo.findById.mockResolvedValue({
        ...titleChallenge,
        championshipId: 'tag',
        challengeMode: 'tag_team',
        challengerTagTeamId: 'team-1',
        challengedTagTeamId: 'team-2',
      });
      mockChampionshipsRepo.findById.mockResolvedValue({ championshipId: 'tag', type: 'tag', currentChampion: ['p2', 'p4'], isActive: true });
      mockTagTeamsRepo.findById.mockImplementation((id: string) => Promise.resolve(id === 'team-1'
        ? { tagTeamId: id, player1Id: 'p1', player2Id: 'p3', status: 'active' }
        : { tagTeamId: id, player1Id: 'p2', player2Id: 'p4', status: 'active' }));
      mockPlayersRepo.findById.mockImplementation((id: string) => Promise.resolve({ playerId: id, currentWrestler: id }));

      const result = await respondToChallenge(respondEvent({ action: 'counter', counterMatchType: 'Tornado Tag' }), ctx, cb);

      expect(result!.statusCode).toBe(200);
      expect(JSON.parse(result!.body).counter.championshipId).toBe('tag');
    });

    it('returns 400 when the title has gone', async () => {
      setupTitleCounter();
      mockChampionshipsRepo.findById.mockResolvedValue(null);
      const result = await respondToChallenge(respondEvent({ action: 'counter', counterMatchType: 'Ladder' }), ctx, cb);
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Championship not found');
    });
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockChallengesRepo.findById.mockRejectedValue(new Error('DB failure'));
    const result = await respondToChallenge(respondEvent({ action: 'accept' }), ctx, cb);
    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to respond to challenge');
  });
});
