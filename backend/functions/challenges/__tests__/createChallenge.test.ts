import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockGet, mockPut, mockQuery, mockQueryAll } = vi.hoisted(() => ({
  mockGet: vi.fn(), mockPut: vi.fn(), mockQuery: vi.fn(), mockQueryAll: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: { get: mockGet, put: mockPut, query: mockQuery, queryAll: mockQueryAll },
  TableNames: { CHALLENGES: 'Challenges', PLAYERS: 'Players', TAG_TEAMS: 'TagTeams' },
}));

vi.mock('../../../lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createNotifications: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

import { handler as createChallenge } from '../createChallenge';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'POST',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: {} } as any, ...overrides,
  };
}

function withAuth(event: APIGatewayProxyEvent, groups: string, sub = 'user-sub-1'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: sub },
    } as any,
  };
}

function wrestlerEvent(body: object) {
  return withAuth(makeEvent({ body: JSON.stringify(body) }), 'Wrestler');
}

// ─── createChallenge ────────────────────────────────────────────────

describe('createChallenge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a challenge with required fields and returns 201', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1', currentWrestler: 'Cena' }] });
    mockGet.mockResolvedValue({ Item: { playerId: 'p2', name: 'The Rock', currentWrestler: 'The Rock' } });
    mockPut.mockResolvedValue({});

    const result = await createChallenge(wrestlerEvent({ challengedId: 'p2', matchType: 'Singles' }), ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.challengeId).toBe('test-uuid-1234');
    expect(body.challengerId).toBe('p1');
    expect(body.challengedId).toBe('p2');
    expect(body.matchType).toBe('Singles');
    expect(body.status).toBe('pending');
    expect(body.expiresAt).toBeDefined();
    expect(body.createdAt).toBeDefined();
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it('includes optional fields (stipulation, championshipId, message) when provided', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1', currentWrestler: 'Cena' }] });
    mockGet.mockResolvedValue({ Item: { playerId: 'p2', currentWrestler: 'The Rock' } });
    mockPut.mockResolvedValue({});

    const result = await createChallenge(
      wrestlerEvent({ challengedId: 'p2', matchType: 'Cage', stipulation: 'Steel Cage', championshipId: 'title-1', message: 'You are going down!' }),
      ctx, cb,
    );

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.stipulation).toBe('Steel Cage');
    expect(body.championshipId).toBe('title-1');
    expect(body.message).toBe('You are going down!');
  });

  it('omits optional fields when not provided', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1', currentWrestler: 'Cena' }] });
    mockGet.mockResolvedValue({ Item: { playerId: 'p2', currentWrestler: 'The Rock' } });
    mockPut.mockResolvedValue({});

    const result = await createChallenge(wrestlerEvent({ challengedId: 'p2', matchType: 'Singles' }), ctx, cb);
    const body = JSON.parse(result!.body);
    expect(body.stipulation).toBeUndefined();
    expect(body.championshipId).toBeUndefined();
    expect(body.message).toBeUndefined();
  });

  it('returns 400 when the championship does not exist', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1', currentWrestler: 'Cena' }] });
    mockGet.mockResolvedValueOnce({ Item: undefined }); // championship lookup
    mockPut.mockResolvedValue({});

    const result = await createChallenge(
      wrestlerEvent({ challengedId: 'p2', matchType: 'Singles', championshipId: 'ghost-title' }),
      ctx, cb,
    );

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Championship not found');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('returns 400 when the championship is inactive', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1', currentWrestler: 'Cena' }] });
    mockGet.mockResolvedValueOnce({ Item: { championshipId: 'title-1', isActive: false } }); // championship lookup
    mockPut.mockResolvedValue({});

    const result = await createChallenge(
      wrestlerEvent({ challengedId: 'p2', matchType: 'Singles', championshipId: 'title-1' }),
      ctx, cb,
    );

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('This championship is inactive and cannot be challenged for');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('returns 400 when user does not have Wrestler role', async () => {
    const event = withAuth(makeEvent({ body: JSON.stringify({ challengedId: 'p2', matchType: 'Singles' }) }), 'Fantasy');
    const result = await createChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Only wrestlers can issue challenges');
  });

  it('returns 400 when request body is missing', async () => {
    const result = await createChallenge(withAuth(makeEvent({ body: null }), 'Wrestler'), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 when request body is invalid JSON', async () => {
    const result = await createChallenge(withAuth(makeEvent({ body: 'not-json{' }), 'Wrestler'), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 400 when challengedId is missing', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1', currentWrestler: 'Cena' }] });
    const result = await createChallenge(wrestlerEvent({ matchType: 'Singles' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('challengedId is required');
  });

  it('returns 400 when matchType is missing', async () => {
    const result = await createChallenge(wrestlerEvent({ challengedId: 'p2' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('matchType is required');
  });

  it('returns 400 when no player profile is linked to the user account', async () => {
    mockQuery.mockResolvedValue({ Items: [] });
    const result = await createChallenge(wrestlerEvent({ challengedId: 'p2', matchType: 'Singles' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('No player profile linked to your account');
  });

  it('returns 400 when trying to challenge yourself', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1', currentWrestler: 'Cena' }] });
    const result = await createChallenge(wrestlerEvent({ challengedId: 'p1', matchType: 'Singles' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('You cannot challenge yourself');
  });

  it('returns 400 when challenged player does not exist', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1', currentWrestler: 'Cena' }] });
    mockGet.mockResolvedValue({ Item: undefined });
    const result = await createChallenge(wrestlerEvent({ challengedId: 'nonexistent', matchType: 'Singles' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Challenged player not found');
  });

  it('sets 4-day expiration on created challenge', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'user-sub-1', currentWrestler: 'Cena' }] });
    mockGet.mockResolvedValue({ Item: { playerId: 'p2', currentWrestler: 'The Rock' } });
    mockPut.mockResolvedValue({});

    const result = await createChallenge(wrestlerEvent({ challengedId: 'p2', matchType: 'Singles' }), ctx, cb);
    const body = JSON.parse(result!.body);
    const diffDays = (new Date(body.expiresAt).getTime() - new Date(body.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(4, 2);
  });

  it('allows Admin to create challenges (hasRole grants Admin access)', async () => {
    mockQuery.mockResolvedValue({ Items: [{ playerId: 'p1', userId: 'admin-sub', currentWrestler: 'Cena' }] });
    mockGet.mockResolvedValue({ Item: { playerId: 'p2', currentWrestler: 'The Rock' } });
    mockPut.mockResolvedValue({});

    const event = withAuth(makeEvent({ body: JSON.stringify({ challengedId: 'p2', matchType: 'Singles' }) }), 'Admin', 'admin-sub');
    const result = await createChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(201);
  });

  describe('titles', () => {
    const challenger = { playerId: 'p1', userId: 'user-sub-1', currentWrestler: 'Cena' };
    const challenged = { playerId: 'p2', name: 'The Rock', currentWrestler: 'The Rock' };
    const worldTitle = { championshipId: 'world', name: 'World Title', type: 'singles', currentChampion: 'p2', isActive: true };
    const tagTitle = { championshipId: 'tag', name: 'Tag Titles', type: 'tag', currentChampion: ['p3', 'p4'], isActive: true };
    const myTeam = { tagTeamId: 'team-1', name: 'Us', player1Id: 'p1', player2Id: 'p2', status: 'active' };
    const theirTeam = { tagTeamId: 'team-2', name: 'Them', player1Id: 'p3', player2Id: 'p4', status: 'active' };

    function mockLookups() {
      mockQuery.mockResolvedValue({ Items: [challenger] });
      mockQueryAll.mockImplementation(({ IndexName }: { IndexName: string }) =>
        Promise.resolve(IndexName === 'Player1Index' ? [myTeam] : []));
      mockGet.mockImplementation(({ Key }: { Key: Record<string, string> }) => {
        if (Key.championshipId) {
          return Promise.resolve({ Item: [worldTitle, tagTitle].find((item) => item.championshipId === Key.championshipId) });
        }
        if (Key.tagTeamId) return Promise.resolve({ Item: theirTeam });
        return Promise.resolve({ Item: { ...challenged, playerId: Key.playerId } });
      });
      mockPut.mockResolvedValue({});
    }

    it('rejects the placeholder id the old form sent', async () => {
      mockLookups();
      const result = await createChallenge(
        wrestlerEvent({ challengedId: 'p2', matchType: 'Singles', championshipId: 'championship-match' }), ctx, cb,
      );
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Championship not found');
    });

    it('records a singles title held by the opponent', async () => {
      mockLookups();
      const result = await createChallenge(
        wrestlerEvent({ challengedId: 'p2', matchType: 'Singles', championshipId: 'world' }), ctx, cb,
      );
      expect(result!.statusCode).toBe(201);
      expect(JSON.parse(result!.body).championshipId).toBe('world');
    });

    it('rejects a tag title on a singles challenge', async () => {
      mockLookups();
      const result = await createChallenge(
        wrestlerEvent({ challengedId: 'p2', matchType: 'Singles', championshipId: 'tag' }), ctx, cb,
      );
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('A tag team title can only be challenged for in a tag team challenge');
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('records a tag title held by the challenged team', async () => {
      mockLookups();
      const result = await createChallenge(
        wrestlerEvent({ challengeMode: 'tag_team', challengedTagTeamId: 'team-2', matchType: 'Tag Team', championshipId: 'tag' }), ctx, cb,
      );
      expect(result!.statusCode).toBe(201);
      const body = JSON.parse(result!.body);
      expect(body.championshipId).toBe('tag');
      expect(body.challengeMode).toBe('tag_team');
    });

    it('rejects a singles title on a tag team challenge', async () => {
      mockLookups();
      const result = await createChallenge(
        wrestlerEvent({ challengeMode: 'tag_team', challengedTagTeamId: 'team-2', matchType: 'Tag Team', championshipId: 'world' }), ctx, cb,
      );
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('A singles title cannot be challenged for in a tag team challenge');
      expect(mockPut).not.toHaveBeenCalled();
    });
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockQuery.mockRejectedValue(new Error('DynamoDB failure'));
    const result = await createChallenge(wrestlerEvent({ challengedId: 'p2', matchType: 'Singles' }), ctx, cb);
    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to create challenge');
  });
});
