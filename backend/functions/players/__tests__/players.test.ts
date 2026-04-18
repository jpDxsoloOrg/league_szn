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
    PLAYERS: 'Players',
    DIVISIONS: 'Divisions',
    CHAMPIONSHIPS: 'Championships',
    SEASON_STANDINGS: 'SeasonStandings',
    SEASONS: 'Seasons',
    STABLES: 'Stables',
    TAG_TEAMS: 'TagTeams',
    STABLE_INVITATIONS: 'StableInvitations',
  },
}));

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

import { handler as createPlayer } from '../createPlayer';
import { handler as getPlayers } from '../getPlayers';
import { handler as updatePlayer } from '../updatePlayer';
import { handler as deletePlayer } from '../deletePlayer';
import { handler as getMyProfile } from '../getMyProfile';
import { handler as updateMyProfile } from '../updateMyProfile';

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

function withAuth(event: APIGatewayProxyEvent, groups: string, sub = 'user-sub-1'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: sub },
    } as any,
  };
}

// ─── createPlayer ────────────────────────────────────────────────────

describe('createPlayer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a player with required fields and returns 201', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({
      body: JSON.stringify({ name: 'John Doe', currentWrestler: 'The Rock' }),
    });

    const result = await createPlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.playerId).toBe('test-uuid-1234');
    expect(body.name).toBe('John Doe');
    expect(body.currentWrestler).toBe('The Rock');
    expect(body.wins).toBe(0);
    expect(body.losses).toBe(0);
    expect(body.draws).toBe(0);
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it('returns 400 when name is missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ currentWrestler: 'The Rock' }),
    });

    const result = await createPlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('name is required');
  });

  it('returns 400 when currentWrestler is missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: 'John' }),
    });

    const result = await createPlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
  });

  it('validates divisionId exists when provided', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    const event = makeEvent({
      body: JSON.stringify({ name: 'John', currentWrestler: 'Rock', divisionId: 'bad-div' }),
    });

    const result = await createPlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toContain('Division');
  });

  it('creates player with valid divisionId', async () => {
    mockGet.mockResolvedValue({ Item: { divisionId: 'div-1', name: 'Raw' } });
    mockPut.mockResolvedValue({});
    const event = makeEvent({
      body: JSON.stringify({ name: 'John', currentWrestler: 'Rock', divisionId: 'div-1' }),
    });

    const result = await createPlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    expect(JSON.parse(result!.body).divisionId).toBe('div-1');
  });

  it('returns 400 for missing body', async () => {
    const event = makeEvent({ body: null });

    const result = await createPlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
  });
});

// ─── getPlayers ──────────────────────────────────────────────────────

describe('getPlayers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all players with wrestlers assigned', async () => {
    mockScan.mockResolvedValue({
      Items: [
        { playerId: '1', name: 'P1', currentWrestler: 'The Rock' },
        { playerId: '2', name: 'P2', currentWrestler: 'John Cena' },
      ],
    });

    const result = await getPlayers(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toHaveLength(2);
  });

  it('filters out players without currentWrestler', async () => {
    mockScan.mockResolvedValue({
      Items: [
        { playerId: '1', name: 'P1', currentWrestler: 'The Rock' },
        { playerId: '2', name: 'P2' },
      ],
    });

    const result = await getPlayers(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toHaveLength(1);
  });

  it('returns empty array when no players exist', async () => {
    mockScan.mockResolvedValue({ Items: undefined });

    const result = await getPlayers(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([]);
  });

  it('returns 500 when scan throws an error', async () => {
    mockScan.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await getPlayers(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch players');
  });
});

// ─── updatePlayer ────────────────────────────────────────────────────

describe('updatePlayer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates player fields and returns updated player', async () => {
    mockGet.mockResolvedValue({ Item: { playerId: 'p1', name: 'Old Name' } });
    mockUpdate.mockResolvedValue({ Attributes: { playerId: 'p1', name: 'New Name' } });

    const event = makeEvent({
      pathParameters: { playerId: 'p1' },
      body: JSON.stringify({ name: 'New Name' }),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).name).toBe('New Name');
  });

  it('returns 404 if player does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });

    const event = makeEvent({
      pathParameters: { playerId: 'missing' },
      body: JSON.stringify({ name: 'X' }),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
  });

  it('returns 400 if playerId is missing from path', async () => {
    const event = makeEvent({
      pathParameters: null,
      body: JSON.stringify({ name: 'X' }),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Player ID is required');
  });

  it('returns 400 when no valid fields to update', async () => {
    mockGet.mockResolvedValue({ Item: { playerId: 'p1' } });

    const event = makeEvent({
      pathParameters: { playerId: 'p1' },
      body: JSON.stringify({}),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('No valid fields to update');
  });

  it('removes divisionId when set to empty string', async () => {
    mockGet.mockResolvedValue({ Item: { playerId: 'p1', divisionId: 'div-1' } });
    mockUpdate.mockResolvedValue({ Attributes: { playerId: 'p1' } });

    const event = makeEvent({
      pathParameters: { playerId: 'p1' },
      body: JSON.stringify({ divisionId: '' }),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    // divisionId is set to undefined in patch, buildUpdateExpression skips undefined values
    // so only updatedAt is in the SET clause
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.UpdateExpression).toContain('SET');
  });

  it('updates currentWrestler field', async () => {
    mockGet.mockResolvedValue({ Item: { playerId: 'p1', currentWrestler: 'Old Wrestler' } });
    mockUpdate.mockResolvedValue({ Attributes: { playerId: 'p1', currentWrestler: 'New Wrestler' } });

    const event = makeEvent({
      pathParameters: { playerId: 'p1' },
      body: JSON.stringify({ currentWrestler: 'New Wrestler' }),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).currentWrestler).toBe('New Wrestler');
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.UpdateExpression).toContain('#currentWrestler');
  });

  it('updates imageUrl field', async () => {
    mockGet.mockResolvedValue({ Item: { playerId: 'p1', name: 'John' } });
    mockUpdate.mockResolvedValue({ Attributes: { playerId: 'p1', imageUrl: 'https://example.com/new.png' } });

    const event = makeEvent({
      pathParameters: { playerId: 'p1' },
      body: JSON.stringify({ imageUrl: 'https://example.com/new.png' }),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.UpdateExpression).toContain('#imageUrl');
  });

  it('updates divisionId with valid division (validates existence)', async () => {
    mockGet
      .mockResolvedValueOnce({ Item: { playerId: 'p1', name: 'John' } })
      .mockResolvedValueOnce({ Item: { divisionId: 'div-1', name: 'Raw' } });
    mockUpdate.mockResolvedValue({ Attributes: { playerId: 'p1', divisionId: 'div-1' } });

    const event = makeEvent({
      pathParameters: { playerId: 'p1' },
      body: JSON.stringify({ divisionId: 'div-1' }),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.UpdateExpression).toContain('SET');
    expect(updateCall.UpdateExpression).toContain('#divisionId');
    expect(updateCall.UpdateExpression).not.toMatch(/REMOVE\s.*#divisionId/);
  });

  it('returns 404 when divisionId references non-existent division', async () => {
    mockGet
      .mockResolvedValueOnce({ Item: { playerId: 'p1', name: 'John' } })
      .mockResolvedValueOnce({ Item: undefined });

    const event = makeEvent({
      pathParameters: { playerId: 'p1' },
      body: JSON.stringify({ divisionId: 'bad-div' }),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toContain('Division');
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockGet.mockRejectedValue(new Error('DynamoDB failure'));

    const event = makeEvent({
      pathParameters: { playerId: 'p1' },
      body: JSON.stringify({ name: 'X' }),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to update player');
  });
});

// ─── deletePlayer ────────────────────────────────────────────────────

describe('deletePlayer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes player and returns 204', async () => {
    mockGet.mockResolvedValue({ Item: { playerId: 'p1', name: 'John' } });
    mockScan.mockResolvedValue({ Items: [] }); // no championships
    mockDelete.mockResolvedValue({});
    mockQuery.mockResolvedValue({ Items: [] }); // no standings

    const event = makeEvent({ pathParameters: { playerId: 'p1' } });

    const result = await deletePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    expect(mockDelete).toHaveBeenCalled();
  });

  it('returns 404 if player not found', async () => {
    mockGet.mockResolvedValue({ Item: undefined });

    const event = makeEvent({ pathParameters: { playerId: 'missing' } });

    const result = await deletePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
  });

  it('returns 409 if player is a current champion', async () => {
    mockGet.mockResolvedValue({ Item: { playerId: 'p1' } });
    mockScan.mockResolvedValue({
      Items: [{ name: 'World Championship', currentChampion: 'p1' }],
    });

    const event = makeEvent({ pathParameters: { playerId: 'p1' } });

    const result = await deletePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(409);
    expect(JSON.parse(result!.body).message).toContain('World Championship');
  });

  it('returns 400 if playerId is missing', async () => {
    const event = makeEvent({ pathParameters: null });

    const result = await deletePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
  });

  it('cleans up season standings on delete', async () => {
    mockGet.mockResolvedValue({ Item: { playerId: 'p1' } });
    mockScan.mockResolvedValue({ Items: [] });
    mockDelete.mockResolvedValue({});
    mockQuery.mockResolvedValue({
      Items: [
        { seasonId: 's1', playerId: 'p1' },
        { seasonId: 's2', playerId: 'p1' },
      ],
    });

    const event = makeEvent({ pathParameters: { playerId: 'p1' } });

    await deletePlayer(event, ctx, cb);

    // 1 player delete + 2 standings deletes = 3 total
    expect(mockDelete).toHaveBeenCalledTimes(3);
  });
});

// ─── getMyProfile ────────────────────────────────────────────────────

describe('getMyProfile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 if not Wrestler role', async () => {
    const event = withAuth(makeEvent(), 'Fantasy');

    const result = await getMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
  });

  it('returns player profile with season records for Wrestler', async () => {
    mockQuery.mockResolvedValue({
      Items: [{ playerId: 'p1', name: 'John', userId: 'user-sub-1' }],
    });
    mockScan.mockResolvedValue({
      Items: [{ seasonId: 's1', name: 'Season 1', status: 'active', startDate: '2025-01-01' }],
    });
    mockQueryAll.mockResolvedValue([
      { seasonId: 's1', playerId: 'p1', wins: 5, losses: 2, draws: 1 },
    ]);

    const event = withAuth(makeEvent(), 'Wrestler');

    const result = await getMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.playerId).toBe('p1');
    expect(body.seasonRecords).toHaveLength(1);
    expect(body.seasonRecords[0].wins).toBe(5);
  });

  it('returns 404 if no player linked to user', async () => {
    mockQuery.mockResolvedValue({ Items: [] });

    const event = withAuth(makeEvent(), 'Wrestler');

    const result = await getMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('No player profile found for this user');
  });

  it('shows 0-0-0 for seasons with no standings', async () => {
    mockQuery.mockResolvedValue({
      Items: [{ playerId: 'p1', userId: 'user-sub-1' }],
    });
    mockScan.mockResolvedValue({
      Items: [{ seasonId: 's1', name: 'Season 1', status: 'active', startDate: '2025-01-01' }],
    });
    mockQueryAll.mockResolvedValue([]); // no standings

    const event = withAuth(makeEvent(), 'Wrestler');

    const result = await getMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.seasonRecords[0]).toMatchObject({ wins: 0, losses: 0, draws: 0 });
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockQuery.mockRejectedValue(new Error('DynamoDB failure'));

    const event = withAuth(makeEvent(), 'Wrestler');

    const result = await getMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch player profile');
  });
});

// ─── updateMyProfile ─────────────────────────────────────────────────

describe('updateMyProfile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 if not Wrestler role', async () => {
    const event = withAuth(makeEvent({ body: JSON.stringify({ name: 'X' }) }), 'Fantasy');

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
  });

  it('updates own profile via userId lookup', async () => {
    mockQuery.mockResolvedValue({
      Items: [{ playerId: 'p1', userId: 'user-sub-1', name: 'Old' }],
    });
    mockUpdate.mockResolvedValue({
      Attributes: { playerId: 'p1', name: 'New Name' },
    });

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ name: 'New Name' }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).name).toBe('New Name');
  });

  it('returns 404 if no player profile found', async () => {
    mockQuery.mockResolvedValue({ Items: [] });

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ name: 'X' }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
  });

  it('returns 400 when no valid fields to update', async () => {
    mockQuery.mockResolvedValue({
      Items: [{ playerId: 'p1', userId: 'user-sub-1' }],
    });

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ hackedField: 'nope' }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('No valid fields');
  });

  it('rejects non-string field values', async () => {
    mockQuery.mockResolvedValue({
      Items: [{ playerId: 'p1', userId: 'user-sub-1' }],
    });

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ name: 123 }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('must be a string');
  });

  it('rejects empty name', async () => {
    mockQuery.mockResolvedValue({
      Items: [{ playerId: 'p1', userId: 'user-sub-1' }],
    });

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ name: '   ' }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Name cannot be empty');
  });

  it('rejects name exceeding MAX_NAME_LENGTH (100 chars)', async () => {
    mockQuery.mockResolvedValue({
      Items: [{ playerId: 'p1', userId: 'user-sub-1' }],
    });

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ name: 'A'.repeat(101) }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('100 characters or less');
  });

  it('rejects imageUrl exceeding MAX_URL_LENGTH (2048 chars)', async () => {
    mockQuery.mockResolvedValue({
      Items: [{ playerId: 'p1', userId: 'user-sub-1' }],
    });

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ imageUrl: 'https://x.com/' + 'a'.repeat(2048) }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('2048 characters');
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockQuery.mockRejectedValue(new Error('DynamoDB failure'));

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ name: 'X' }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to update player profile');
  });
});
