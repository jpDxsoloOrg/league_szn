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

const { mockInvokeAsync } = vi.hoisted(() => ({ mockInvokeAsync: vi.fn() }));
vi.mock('../../../lib/asyncLambda', () => ({ invokeAsync: mockInvokeAsync }));

let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import { NEEDS_WRESTLER } from '../../../lib/needsWrestler';
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

  it('creates a player on the Needs Wrestler placeholder when no wrestler is given', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: 'John' }),
    });

    const result = await createPlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    expect(JSON.parse(result!.body).currentWrestler).toBe(NEEDS_WRESTLER);
  });

  it('falls back to the placeholder when currentWrestler is blank', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: 'John', currentWrestler: '   ' }),
    });

    const result = await createPlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    expect(JSON.parse(result!.body).currentWrestler).toBe(NEEDS_WRESTLER);
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

  it('stamps divisionJoinedAt on a player created with a division', async () => {
    const division = await repos.leagueOps.divisions.create({ name: 'Raw' });

    const result = await createPlayer(
      makeEvent({ body: JSON.stringify({ name: 'John', currentWrestler: 'Rock', divisionId: division.divisionId }) }),
      ctx,
      cb,
    );

    const body = JSON.parse(result!.body);
    expect(body.divisionJoinedAt).toBe(body.createdAt);
  });

  it('leaves divisionJoinedAt unset on a player created without a division', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });
    expect(player.divisionJoinedAt).toBeUndefined();
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

  it('keeps account ids out of the public list but says who is linked', async () => {
    const linked = await repos.roster.players.create({ name: 'P1', currentWrestler: 'The Rock' });
    await repos.roster.players.update(linked.playerId, { userId: 'secret-sub', psnId: 'rock_psn' });
    await repos.roster.players.create({ name: 'P2', currentWrestler: 'John Cena' });

    const result = await getPlayers(makeEvent(), ctx, cb);

    expect(result!.body).not.toContain('secret-sub');
    const rows = JSON.parse(result!.body) as Array<{ name: string; hasLinkedAccount: boolean; psnId?: string }>;
    expect(rows.find((row) => row.name === 'P1')).toMatchObject({ hasLinkedAccount: true, psnId: 'rock_psn' });
    expect(rows.find((row) => row.name === 'P2')?.hasLinkedAccount).toBe(false);
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
  it.each([[''], ['   '], [null]])('rejects a blank name (%j) and changes nothing', async (name) => {
    const player = await repos.roster.players.create({ name: 'Old Name', currentWrestler: 'Rock' });
    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({ name, bio: 'kept out' }),
    });

    const result = await updatePlayer(withAuth(event, 'Admin'), ctx, cb);

    expect(result!.statusCode).toBe(400);
    const stored = await repos.roster.players.findById(player.playerId);
    expect(stored).toMatchObject({ name: 'Old Name' });
    expect(stored?.bio).toBeUndefined();
  });

  it('returns 403 for a Wrestler-role user (staff only)', async () => {
    const player = await repos.roster.players.create({ name: 'Old Name', currentWrestler: 'Rock' });
    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({ bio: 'not yours' }),
    });

    const result = await updatePlayer(withAuth(event, 'Wrestler'), ctx, cb);

    expect(result!.statusCode).toBe(403);
    const stored = await repos.roster.players.findById(player.playerId);
    expect(stored?.bio).toBeUndefined();
  });

  it('allows a Moderator', async () => {
    const player = await repos.roster.players.create({ name: 'Old Name', currentWrestler: 'Rock' });
    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({ name: 'Renamed' }),
    });

    const result = await updatePlayer(withAuth(event, 'Moderator'), ctx, cb);

    expect(result!.statusCode).toBe(200);
  });

  it('updates player fields and returns updated player', async () => {
    const player = await repos.roster.players.create({ name: 'Old Name', currentWrestler: 'Rock' });

    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({ name: 'New Name' }),
    });

    const result = await updatePlayer(withAuth(event, 'Admin'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).name).toBe('New Name');
  });

  it('returns 404 if player does not exist', async () => {
    const event = makeEvent({
      pathParameters: { playerId: 'missing' },
      body: JSON.stringify({ name: 'X' }),
    });

    const result = await updatePlayer(withAuth(event, 'Admin'), ctx, cb);

    expect(result!.statusCode).toBe(404);
  });

  it('returns 400 if playerId is missing from path', async () => {
    const event = makeEvent({
      pathParameters: null,
      body: JSON.stringify({ name: 'X' }),
    });

    const result = await updatePlayer(withAuth(event, 'Admin'), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Player ID is required');
  });

  it('returns 400 when no valid fields to update', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });

    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({}),
    });

    const result = await updatePlayer(withAuth(event, 'Admin'), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('No valid fields to update');
  });

  it('removes divisionId when set to empty string', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });

    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({ divisionId: '' }),
    });

    const result = await updatePlayer(withAuth(event, 'Admin'), ctx, cb);

    expect(result!.statusCode).toBe(200);
  });

  it.each([
    ['psnId', ''],
    ['psnId', null],
    ['imageUrl', ''],
    ['imageUrl', null],
  ] as const)('removes %s when set to %j', async (field, cleared) => {
    const created = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });
    const player = await repos.roster.players.update(created.playerId, {
      psnId: 'old_psn',
      imageUrl: 'https://img.example/old.png',
    });

    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({ [field]: cleared }),
    });

    const result = await updatePlayer(withAuth(event, 'Admin'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const stored = await repos.roster.players.findById(player.playerId);
    expect(stored).not.toHaveProperty(field);
    const kept = field === 'psnId' ? 'imageUrl' : 'psnId';
    expect(stored?.[kept]).toBe(player[kept]);
  });

  it('leaves psnId and imageUrl alone when the keys are absent', async () => {
    const created = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });
    await repos.roster.players.update(created.playerId, {
      psnId: 'old_psn',
      imageUrl: 'https://img.example/old.png',
    });

    const event = makeEvent({
      pathParameters: { playerId: created.playerId },
      body: JSON.stringify({ name: 'Johnny' }),
    });

    const result = await updatePlayer(withAuth(event, 'Admin'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const stored = await repos.roster.players.findById(created.playerId);
    expect(stored?.psnId).toBe('old_psn');
    expect(stored?.imageUrl).toBe('https://img.example/old.png');
  });

  it('updates currentWrestler field', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Old Wrestler' });

    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({ currentWrestler: 'New Wrestler' }),
    });

    const result = await updatePlayer(withAuth(event, 'Admin'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).currentWrestler).toBe('New Wrestler');
  });

  it('updates imageUrl field', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });

    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({ imageUrl: 'https://example.com/new.png' }),
    });

    const result = await updatePlayer(withAuth(event, 'Admin'), ctx, cb);

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

    const result = await updatePlayer(withAuth(event, 'Admin'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).divisionId).toBe(divisionId);
  });

  it('restamps divisionJoinedAt only when the division actually changes', async () => {
    const raw = await repos.leagueOps.divisions.create({ name: 'Raw' });
    const smackdown = await repos.leagueOps.divisions.create({ name: 'SmackDown' });
    const player = await repos.roster.players.create({
      name: 'John',
      currentWrestler: 'Rock',
      divisionId: raw.divisionId,
      divisionJoinedAt: '2026-01-01T00:00:00.000Z',
    });
    const update = (divisionId: string) => updatePlayer(
      withAuth(makeEvent({ pathParameters: { playerId: player.playerId }, body: JSON.stringify({ divisionId }) }), 'Admin'),
      ctx,
      cb,
    );

    const same = JSON.parse((await update(raw.divisionId))!.body);
    expect(same.divisionJoinedAt).toBe('2026-01-01T00:00:00.000Z');

    const moved = JSON.parse((await update(smackdown.divisionId))!.body);
    expect(moved.divisionId).toBe(smackdown.divisionId);
    expect(moved.divisionJoinedAt).not.toBe('2026-01-01T00:00:00.000Z');
    expect(Date.parse(moved.divisionJoinedAt)).not.toBeNaN();
  });

  describe('progression recompute on division change', () => {
    const update = (playerId: string, body: Record<string, unknown>) => updatePlayer(
      withAuth(makeEvent({ pathParameters: { playerId }, body: JSON.stringify(body) }), 'Admin'),
      ctx,
      cb,
    );

    beforeEach(() => {
      mockInvokeAsync.mockReset();
      mockInvokeAsync.mockResolvedValue(undefined);
    });

    it('recomputes the player when the division changes', async () => {
      const dojo = await repos.leagueOps.divisions.create({ name: 'Dojo' });
      const raw = await repos.leagueOps.divisions.create({ name: 'Raw' });
      const player = await repos.roster.players.create({ name: 'YB', currentWrestler: 'Rock', divisionId: dojo.divisionId });

      const result = await update(player.playerId, { divisionId: raw.divisionId });

      expect(result!.statusCode).toBe(200);
      expect(mockInvokeAsync).toHaveBeenCalledTimes(1);
      expect(mockInvokeAsync).toHaveBeenCalledWith('progression', expect.objectContaining({ playerIds: [player.playerId] }));
    });

    it('recomputes the player when the division is cleared', async () => {
      const dojo = await repos.leagueOps.divisions.create({ name: 'Dojo' });
      const player = await repos.roster.players.create({ name: 'YB', currentWrestler: 'Rock', divisionId: dojo.divisionId });

      const result = await update(player.playerId, { divisionId: '' });

      expect(result!.statusCode).toBe(200);
      expect(mockInvokeAsync).toHaveBeenCalledWith('progression', expect.objectContaining({ playerIds: [player.playerId] }));
    });

    it('does not recompute when the division is unchanged or not sent', async () => {
      const dojo = await repos.leagueOps.divisions.create({ name: 'Dojo' });
      const player = await repos.roster.players.create({ name: 'YB', currentWrestler: 'Rock', divisionId: dojo.divisionId });

      await update(player.playerId, { divisionId: dojo.divisionId });
      await update(player.playerId, { name: 'Renamed' });

      expect(mockInvokeAsync).not.toHaveBeenCalled();
    });

    it('still saves the player when the progression invoke fails', async () => {
      const dojo = await repos.leagueOps.divisions.create({ name: 'Dojo' });
      const raw = await repos.leagueOps.divisions.create({ name: 'Raw' });
      const player = await repos.roster.players.create({ name: 'YB', currentWrestler: 'Rock', divisionId: dojo.divisionId });
      mockInvokeAsync.mockRejectedValue(new Error('lambda down'));

      const result = await update(player.playerId, { divisionId: raw.divisionId });

      expect(result!.statusCode).toBe(200);
      expect((await repos.roster.players.findById(player.playerId))?.divisionId).toBe(raw.divisionId);
    });
  });

  it('returns 404 when divisionId references non-existent division', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });

    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({ divisionId: 'bad-div' }),
    });

    const result = await updatePlayer(withAuth(event, 'Admin'), ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toContain('Division');
  });

  it('returns 500 when an unexpected error occurs', async () => {
    vi.spyOn(repos.roster.players, 'findById').mockRejectedValue(new Error('DB failure'));

    const event = makeEvent({
      pathParameters: { playerId: 'p1' },
      body: JSON.stringify({ name: 'X' }),
    });

    const result = await updatePlayer(withAuth(event, 'Admin'), ctx, cb);

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

  describe('memberships', () => {
    async function seedStable(memberIds: string[], leaderId: string) {
      const stable = await repos.roster.stables.create({ name: 'Faction', leaderId, memberIds });
      await repos.roster.stables.update(stable.stableId, { status: 'active', memberIds });
      for (const memberId of memberIds) {
        await repos.roster.players.update(memberId, { stableId: stable.stableId });
      }
      return stable;
    }

    async function seedTagTeam(player1Id: string, player2Id: string) {
      const tagTeam = await repos.roster.tagTeams.create({ name: 'Team', player1Id, player2Id });
      await repos.roster.tagTeams.update(tagTeam.tagTeamId, { status: 'active' });
      await repos.roster.players.update(player1Id, { tagTeamId: tagTeam.tagTeamId });
      await repos.roster.players.update(player2Id, { tagTeamId: tagTeam.tagTeamId });
      return tagTeam;
    }

    const seedPlayer = (name: string) =>
      repos.roster.players.create({ name, currentWrestler: name });

    it('leaves stable and tag team intact when the player is a champion', async () => {
      const champ = await seedPlayer('Champ');
      const mate = await seedPlayer('Mate');
      const third = await seedPlayer('Third');
      const stable = await seedStable([champ.playerId, mate.playerId, third.playerId], champ.playerId);
      const tagTeam = await seedTagTeam(champ.playerId, mate.playerId);
      await repos.competition.championships.create({
        name: 'World', type: 'singles', currentChampion: champ.playerId,
      });

      const result = await deletePlayer(
        makeEvent({ pathParameters: { playerId: champ.playerId } }),
        ctx,
        cb,
      );

      expect(result!.statusCode).toBe(409);
      const stableAfter = await repos.roster.stables.findById(stable.stableId);
      expect(stableAfter!.status).toBe('active');
      expect(stableAfter!.memberIds).toHaveLength(3);
      expect(stableAfter!.leaderId).toBe(champ.playerId);
      expect((await repos.roster.tagTeams.findById(tagTeam.tagTeamId))!.status).toBe('active');
      const mateAfter = await repos.roster.players.findById(mate.playerId);
      expect(mateAfter!.tagTeamId).toBe(tagTeam.tagTeamId);
      expect(mateAfter!.stableId).toBe(stable.stableId);
    });

    it('clears a stable-mate who is also the tag partner with a single update', async () => {
      const leaving = await seedPlayer('Leaving');
      const partner = await seedPlayer('Partner');
      const stable = await seedStable([leaving.playerId, partner.playerId], leaving.playerId);
      const tagTeam = await seedTagTeam(leaving.playerId, partner.playerId);
      const updatedPlayerIds: string[] = [];
      const runInTransaction = repos.runInTransaction;
      repos.runInTransaction = (work) =>
        runInTransaction(async (tx) => {
          const updatePlayer = tx.updatePlayer.bind(tx);
          tx.updatePlayer = (playerId, patch) => {
            updatedPlayerIds.push(playerId);
            updatePlayer(playerId, patch);
          };
          return work(tx);
        });

      const result = await deletePlayer(
        makeEvent({ pathParameters: { playerId: leaving.playerId } }),
        ctx,
        cb,
      );

      expect(result!.statusCode).toBe(204);
      // Once for the partner, then the soft delete of the leaving player.
      expect(updatedPlayerIds).toEqual([partner.playerId, leaving.playerId]);
      const partnerAfter = await repos.roster.players.findById(partner.playerId);
      expect(partnerAfter!.stableId).toBeUndefined();
      expect(partnerAfter!.tagTeamId).toBeUndefined();
      expect((await repos.roster.stables.findById(stable.stableId))!.status).toBe('disbanded');
      expect((await repos.roster.tagTeams.findById(tagTeam.tagTeamId))!.status).toBe('dissolved');
    });

    it('promotes a new leader when the leader of a larger stable leaves', async () => {
      const leader = await seedPlayer('Leader');
      const second = await seedPlayer('Second');
      const third = await seedPlayer('Third');
      const stable = await seedStable([leader.playerId, second.playerId, third.playerId], leader.playerId);

      await deletePlayer(makeEvent({ pathParameters: { playerId: leader.playerId } }), ctx, cb);

      const stableAfter = await repos.roster.stables.findById(stable.stableId);
      expect(stableAfter!.status).toBe('active');
      expect(stableAfter!.leaderId).toBe(second.playerId);
      expect(stableAfter!.memberIds).toEqual([second.playerId, third.playerId]);
    });

    it('does not stage an update for a partner row that no longer exists', async () => {
      const leaving = await seedPlayer('Leaving');
      const gone = await seedPlayer('Gone');
      await seedTagTeam(leaving.playerId, gone.playerId);
      await repos.roster.players.delete(gone.playerId);
      const updatedPlayerIds: string[] = [];
      const runInTransaction = repos.runInTransaction;
      repos.runInTransaction = (work) =>
        runInTransaction(async (tx) => {
          tx.updatePlayer = (playerId) => {
            updatedPlayerIds.push(playerId);
          };
          return work(tx);
        });

      const result = await deletePlayer(
        makeEvent({ pathParameters: { playerId: leaving.playerId } }),
        ctx,
        cb,
      );

      expect(result!.statusCode).toBe(204);
      expect(updatedPlayerIds).toEqual([leaving.playerId]);
    });

    it('keeps the player and reports the failure when cleanup fails, then succeeds on retry', async () => {
      const leaving = await seedPlayer('Leaving');
      const second = await seedPlayer('Second');
      const stable = await seedStable([leaving.playerId, second.playerId], leaving.playerId);
      const stableUpdate = repos.roster.stables.update;
      repos.roster.stables.update = vi.fn().mockRejectedValue(new Error('boom'));

      const failed = await deletePlayer(
        makeEvent({ pathParameters: { playerId: leaving.playerId } }),
        ctx,
        cb,
      );

      expect(failed!.statusCode).toBe(500);
      expect(await repos.roster.players.findById(leaving.playerId)).not.toBeNull();

      repos.roster.stables.update = stableUpdate;
      const retried = await deletePlayer(
        makeEvent({ pathParameters: { playerId: leaving.playerId } }),
        ctx,
        cb,
      );

      expect(retried!.statusCode).toBe(204);
      expect(await repos.roster.players.findById(leaving.playerId)).toBeNull();
      expect((await repos.roster.stables.findById(stable.stableId))!.status).toBe('disbanded');
    });
  });
});

// ─── getMyProfile ────────────────────────────────────────────────────

describe('getMyProfile', () => {
  it('returns 403 if not Wrestler role', async () => {
    const event = withAuth(makeEvent(), '');

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

describe('moveset fields', () => {
  async function ownProfile() {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });
    await repos.roster.players.update(player.playerId, { userId: 'user-sub-1' });
    return player;
  }

  it('updateMyProfile stores bio, signatures and finishers (compacted)', async () => {
    await ownProfile();
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({
          bio: '  The American Nightmare  ',
          signatures: [
            { gameName: 'Cody Cutter', customName: 'The Cutter' },
            { gameName: '', customName: '' },
          ],
          finishers: [{ gameName: 'Cross Rhodes' }],
        }),
      }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.bio).toBe('The American Nightmare');
    expect(body.signatures).toEqual([{ gameName: 'Cody Cutter', customName: 'The Cutter' }]);
    expect(body.finishers).toEqual([{ gameName: 'Cross Rhodes', customName: '' }]);
  });

  it('updateMyProfile clears lists with an empty array and bio with empty string', async () => {
    const player = await ownProfile();
    await repos.roster.players.update(player.playerId, {
      bio: 'old',
      signatures: [{ gameName: 'a', customName: '' }],
    });
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ bio: '', signatures: [] }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.bio).toBe('');
    expect(body.signatures).toEqual([]);
  });

  it('updateMyProfile rejects more than five moves', async () => {
    await ownProfile();
    const six = Array.from({ length: 6 }, (_, i) => ({ gameName: `m${i}`, customName: '' }));
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ finishers: six }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('at most 5');
  });

  it('updateMyProfile rejects a bio over 500 characters', async () => {
    await ownProfile();
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ bio: 'x'.repeat(501) }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('500');
  });

  it('updateMyProfile rejects a move name over 60 characters', async () => {
    await ownProfile();
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ signatures: [{ gameName: 'y'.repeat(61) }] }) }),
      'Wrestler',
    );

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('60');
  });

  it('updateMyProfile rejects a non-string bio', async () => {
    await ownProfile();
    const event = withAuth(makeEvent({ body: JSON.stringify({ bio: 7 }) }), 'Wrestler');

    const result = await updateMyProfile(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
  });

  it('updatePlayer (admin) accepts the same fields', async () => {
    const player = await repos.roster.players.create({ name: 'John', currentWrestler: 'Rock' });
    const event = makeEvent({
      pathParameters: { playerId: player.playerId },
      body: JSON.stringify({
        bio: 'Admin wrote this',
        finishers: [{ gameName: 'Pedigree', customName: 'The Pedigree' }],
      }),
    });

    const result = await updatePlayer(withAuth(event, 'Admin'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.bio).toBe('Admin wrote this');
    expect(body.finishers).toEqual([{ gameName: 'Pedigree', customName: 'The Pedigree' }]);
  });
});

describe('updateMyProfile', () => {
  it('returns 403 if not Wrestler role', async () => {
    const event = withAuth(makeEvent({ body: JSON.stringify({ name: 'X' }) }), '');

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
