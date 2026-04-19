import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── dynamoDb mock (still needed for handlers that use dynamoDb directly) ────
const { mockQuery: mockDynamoQuery, mockDelete: mockDynamoDelete, mockUpdate: mockDynamoUpdate, mockQueryAll: mockDynamoQueryAll } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockDelete: vi.fn(),
  mockUpdate: vi.fn(),
  mockQueryAll: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: vi.fn(),
    put: vi.fn(),
    scan: vi.fn(),
    query: mockDynamoQuery,
    update: mockDynamoUpdate,
    delete: mockDynamoDelete,
    scanAll: vi.fn(),
    queryAll: mockDynamoQueryAll,
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

let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';

import { handler as createPlayer } from '../createPlayer';
import { handler as getPlayers } from '../getPlayers';
import { handler as updatePlayer } from '../updatePlayer';
import { handler as deletePlayer } from '../deletePlayer';
import { handler as getMyProfile } from '../getMyProfile';
import { handler as updateMyProfile } from '../updateMyProfile';

// ─── Helpers ─────────────────────────────────────────────────────────

let repos: Repositories;
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
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

function withAuth(event: APIGatewayProxyEvent, groups: string, sub = 'user-sub-1'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: sub },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

// ─── createPlayer ────────────────────────────────────────────────────

describe('createPlayer', () => {
  it('creates a player with required fields and returns 201', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: 'John Doe', currentWrestler: 'The Rock' }),
    });

    const result = await createPlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.playerId).toBeDefined();
    expect(body.name).toBe('John Doe');
    expect(body.currentWrestler).toBe('The Rock');
    expect(body.wins).toBe(0);
    expect(body.losses).toBe(0);
    expect(body.draws).toBe(0);
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
    // Division does not exist in repos
    const event = makeEvent({
      body: JSON.stringify({ name: 'John', currentWrestler: 'Rock', divisionId: 'bad-div' }),
    });

    const result = await createPlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toContain('Division');
  });

  it('creates player with valid divisionId', async () => {
    await repos.leagueOps.divisions.create({ name: 'Raw' });
    const divisions = await repos.leagueOps.divisions.list();
    const divisionId = divisions[0].divisionId;

    const event = makeEvent({
      body: JSON.stringify({ name: 'John', currentWrestler: 'Rock', divisionId }),
    });

    const result = await createPlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    expect(JSON.parse(result!.body).divisionId).toBe(divisionId);
  });

  it('returns 400 for missing body', async () => {
    const event = makeEvent({ body: null });

    const result = await createPlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
  });
});

// ─── getPlayers ──────────────────────────────────────────────────────

describe('getPlayers', () => {
  it('returns all players with wrestlers assigned', async () => {
    await repos.roster.players.create({ name: 'P1', currentWrestler: 'The Rock' });
    await repos.roster.players.create({ name: 'P2', currentWrestler: 'John Cena' });

    const result = await getPlayers(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toHaveLength(2);
  });

  it('filters out players without currentWrestler', async () => {
    await repos.roster.players.create({ name: 'P1', currentWrestler: 'The Rock' });
    // Create a player without currentWrestler via store directly
    const store = (repos.roster as unknown as { playersStore: Map<string, Record<string, unknown>> }).playersStore;
    store.set('p-no-wrestler', {
      playerId: 'p-no-wrestler', name: 'P2', wins: 0, losses: 0, draws: 0,
      createdAt: new Date().toISOString(),
    });

    const result = await getPlayers(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toHaveLength(1);
  });

  it('returns empty array when no players exist', async () => {
    const result = await getPlayers(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([]);
  });

  it('returns 500 when list throws an error', async () => {
    vi.spyOn(repos.roster.players, 'list').mockRejectedValue(new Error('DB failure'));

    const result = await getPlayers(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch players');
  });
});

// ─── updatePlayer ────────────────────────────────────────────────────

describe('updatePlayer', () => {
  it('updates player fields and returns updated player', async () => {
    const player = await repos.roster.players.create({ name: 'Old Name', currentWrestler: 'Rock' });

    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({ name: 'New Name' }),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).name).toBe('New Name');
  });

  it('returns 404 if player does not exist', async () => {
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
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });

    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({}),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('No valid fields to update');
  });

  it('removes divisionId when set to empty string', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });

    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({ divisionId: '' }),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
  });

  it('updates currentWrestler field', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Old Wrestler' });

    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({ currentWrestler: 'New Wrestler' }),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).currentWrestler).toBe('New Wrestler');
  });

  it('updates imageUrl field', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });

    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({ imageUrl: 'https://example.com/new.png' }),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).imageUrl).toBe('https://example.com/new.png');
  });

  it('updates divisionId with valid division (validates existence)', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });
    await repos.leagueOps.divisions.create({ name: 'Raw' });
    const divisions = await repos.leagueOps.divisions.list();
    const divisionId = divisions[0].divisionId;

    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({ divisionId }),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).divisionId).toBe(divisionId);
  });

  it('returns 404 when divisionId references non-existent division', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });

    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({ divisionId: 'bad-div' }),
    });

    const result = await updatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toContain('Division');
  });

  it('returns 500 when an unexpected error occurs', async () => {
    vi.spyOn(repos.roster.players, 'findById').mockRejectedValue(new Error('DB failure'));

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
  it('deletes player and returns 204', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });
    // Mock the dynamoDb calls for season standings cleanup
    mockDynamoQuery.mockResolvedValue({ Items: [] });

    const event = makeEvent({ pathParameters: { playerId: player.playerId } });

    const result = await deletePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    expect(await repos.roster.players.findById(player.playerId)).toBeNull();
  });

  it('returns 404 if player not found', async () => {
    const event = makeEvent({ pathParameters: { playerId: 'missing' } });

    const result = await deletePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
  });

  it('returns 409 if player is a current champion', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });
    await repos.competition.championships.create({
      name: 'World Championship', type: 'singles', currentChampion: player.playerId,
    });

    const event = makeEvent({ pathParameters: { playerId: player.playerId } });

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
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });
    // Seed season standings via repo
    await repos.season.standings.increment('s1', player.playerId, { wins: 1 });
    await repos.season.standings.increment('s2', player.playerId, { wins: 2 });

    const event = makeEvent({ pathParameters: { playerId: player.playerId } });

    await deletePlayer(event, ctx, cb);

    // Season standings should be cleaned up
    const remaining = await repos.season.standings.listByPlayer(player.playerId);
    expect(remaining).toHaveLength(0);
  });
});

// ─── getMyProfile ────────────────────────────────────────────────────

describe('getMyProfile', () => {
  it('returns 403 if not Wrestler role', async () => {
    const event = withAuth(makeEvent(), 'Fantasy');

    const result = await getMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
  });

  it('returns player profile with season records for Wrestler', async () => {
    // Create player linked to user
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });
    await repos.roster.players.update(player.playerId, { userId: 'user-sub-1' });

    // Create a season and add standings via repo
    const season = await repos.season.seasons.create({ name: 'Season 1', startDate: '2025-01-01' });
    await repos.season.standings.increment(season.seasonId, player.playerId, { wins: 5 });
    await repos.season.standings.increment(season.seasonId, player.playerId, { losses: 2 });
    await repos.season.standings.increment(season.seasonId, player.playerId, { draws: 1 });

    const event = withAuth(makeEvent(), 'Wrestler');

    const result = await getMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.playerId).toBe(player.playerId);
    expect(body.seasonRecords).toHaveLength(1);
    expect(body.seasonRecords[0].wins).toBe(5);
  });

  it('returns 404 if no player linked to user', async () => {
    const event = withAuth(makeEvent(), 'Wrestler');

    const result = await getMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('No player profile found for this user');
  });

  it('shows 0-0-0 for seasons with no standings', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });
    await repos.roster.players.update(player.playerId, { userId: 'user-sub-1' });

    await repos.season.seasons.create({ name: 'Season 1', startDate: '2025-01-01' });
    // no standings seeded — will get 0-0-0 defaults

    const event = withAuth(makeEvent(), 'Wrestler');

    const result = await getMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.seasonRecords[0]).toMatchObject({ wins: 0, losses: 0, draws: 0 });
  });

  it('returns 500 when an unexpected error occurs', async () => {
    vi.spyOn(repos.roster.players, 'findByUserId').mockRejectedValue(new Error('DB failure'));

    const event = withAuth(makeEvent(), 'Wrestler');

    const result = await getMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch player profile');
  });
});

// ─── updateMyProfile ─────────────────────────────────────────────────

describe('updateMyProfile', () => {
  it('returns 403 if not Wrestler role', async () => {
    const event = withAuth(makeEvent({ body: JSON.stringify({ name: 'X' }) }), 'Fantasy');

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
  });

  it('updates own profile via userId lookup', async () => {
    const player = await repos.roster.players.create({ name: 'Old', currentWrestler: 'Rock' });
    await repos.roster.players.update(player.playerId, { userId: 'user-sub-1' });

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ name: 'New Name' }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).name).toBe('New Name');
  });

  it('returns 404 if no player profile found', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ name: 'X' }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
  });

  it('returns 400 when no valid fields to update', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });
    await repos.roster.players.update(player.playerId, { userId: 'user-sub-1' });

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ hackedField: 'nope' }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('No valid fields');
  });

  it('rejects non-string field values', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });
    await repos.roster.players.update(player.playerId, { userId: 'user-sub-1' });

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ name: 123 }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('must be a string');
  });

  it('rejects empty name', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });
    await repos.roster.players.update(player.playerId, { userId: 'user-sub-1' });

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ name: '   ' }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Name cannot be empty');
  });

  it('rejects name exceeding MAX_NAME_LENGTH (100 chars)', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });
    await repos.roster.players.update(player.playerId, { userId: 'user-sub-1' });

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ name: 'A'.repeat(101) }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('100 characters or less');
  });

  it('rejects imageUrl exceeding MAX_URL_LENGTH (2048 chars)', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });
    await repos.roster.players.update(player.playerId, { userId: 'user-sub-1' });

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ imageUrl: 'https://x.com/' + 'a'.repeat(2048) }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('2048 characters');
  });

  it('returns 500 when an unexpected error occurs', async () => {
    vi.spyOn(repos.roster.players, 'findByUserId').mockRejectedValue(new Error('DB failure'));

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ name: 'X' }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to update player profile');
  });
});
