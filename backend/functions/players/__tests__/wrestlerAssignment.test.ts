import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// Hoisted dynamoDb mock (some callers still poke dynamoDb directly for
// unrelated cleanup queries — e.g., deletePlayer season-standings scan).
const { mockQuery: mockDynamoQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: vi.fn(),
    put: vi.fn(),
    scan: vi.fn(),
    query: mockDynamoQuery,
    update: vi.fn(),
    delete: vi.fn(),
    scanAll: vi.fn(),
    queryAll: vi.fn(),
  },
  TableNames: {
    PLAYERS: 'Players',
    WRESTLERS: 'Wrestlers',
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
import { handler as updatePlayer } from '../updatePlayer';
import { handler as deletePlayer } from '../deletePlayer';
import { handler as updateMyProfile } from '../updateMyProfile';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
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

function withWrestlerAuth(event: APIGatewayProxyEvent, sub = 'user-sub-1') {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups: 'Wrestler', username: 't', email: 't@t', principalId: sub },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

async function seedWrestler(name: string) {
  return repos.roster.wrestlers.create({
    promotion: 'WWE',
    name,
    overallCap: 88,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  mockDynamoQuery.mockResolvedValue({ Items: [] });
});

// ─── createPlayer with FK ────────────────────────────────────────────

describe('createPlayer with wrestlerId FK', () => {
  it('creates player, fills denormalized name from wrestler, marks wrestler in-use', async () => {
    const rock = await seedWrestler('The Rock');

    const event = makeEvent({
      body: JSON.stringify({ name: 'John', currentWrestlerId: rock.wrestlerId }),
    });
    const result = await createPlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.currentWrestlerId).toBe(rock.wrestlerId);
    expect(body.currentWrestler).toBe('The Rock');

    const after = await repos.roster.wrestlers.findById(rock.wrestlerId);
    expect(after?.isInUse).toBe(true);
    expect(after?.assignedPlayerId).toBe(body.playerId);
    expect(after?.assignedSlot).toBe('primary');
  });

  it('assigns both primary and alternate in a single request', async () => {
    const rock = await seedWrestler('The Rock');
    const cena = await seedWrestler('John Cena');

    const event = makeEvent({
      body: JSON.stringify({
        name: 'Player A',
        currentWrestlerId: rock.wrestlerId,
        alternateWrestlerId: cena.wrestlerId,
      }),
    });
    const result = await createPlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const rockAfter = await repos.roster.wrestlers.findById(rock.wrestlerId);
    const cenaAfter = await repos.roster.wrestlers.findById(cena.wrestlerId);
    expect(rockAfter?.assignedSlot).toBe('primary');
    expect(cenaAfter?.assignedSlot).toBe('alternate');
  });

  it('rejects with 409 when wrestler is already assigned to another player', async () => {
    const rock = await seedWrestler('The Rock');
    await createPlayer(
      makeEvent({ body: JSON.stringify({ name: 'First', currentWrestlerId: rock.wrestlerId }) }),
      ctx,
      cb,
    );

    const second = await createPlayer(
      makeEvent({ body: JSON.stringify({ name: 'Second', currentWrestlerId: rock.wrestlerId }) }),
      ctx,
      cb,
    );

    expect(second!.statusCode).toBe(409);
  });

  it('rejects with 404 when wrestlerId does not exist', async () => {
    const result = await createPlayer(
      makeEvent({ body: JSON.stringify({ name: 'X', currentWrestlerId: 'does-not-exist' }) }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(404);
  });

  it('rejects with 400 when same wrestler is used for both slots', async () => {
    const rock = await seedWrestler('The Rock');
    const result = await createPlayer(
      makeEvent({
        body: JSON.stringify({
          name: 'X',
          currentWrestlerId: rock.wrestlerId,
          alternateWrestlerId: rock.wrestlerId,
        }),
      }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(400);
  });

  it('legacy free-text path still works when no FK is provided', async () => {
    const result = await createPlayer(
      makeEvent({ body: JSON.stringify({ name: 'X', currentWrestler: 'Free Text' }) }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(201);
    expect(JSON.parse(result!.body).currentWrestler).toBe('Free Text');
    expect(JSON.parse(result!.body).currentWrestlerId).toBeUndefined();
  });
});

// ─── updatePlayer FK transitions ─────────────────────────────────────

describe('updatePlayer FK transitions', () => {
  it('assigning a new currentWrestlerId releases the old one', async () => {
    const rock = await seedWrestler('The Rock');
    const cena = await seedWrestler('John Cena');
    const createRes = await createPlayer(
      makeEvent({ body: JSON.stringify({ name: 'X', currentWrestlerId: rock.wrestlerId }) }),
      ctx,
      cb,
    );
    const playerId = JSON.parse(createRes!.body).playerId;

    const result = await updatePlayer(
      makeEvent({
        httpMethod: 'PUT',
        pathParameters: { playerId },
        body: JSON.stringify({ currentWrestlerId: cena.wrestlerId }),
      }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    const rockAfter = await repos.roster.wrestlers.findById(rock.wrestlerId);
    const cenaAfter = await repos.roster.wrestlers.findById(cena.wrestlerId);
    expect(rockAfter?.isInUse).toBe(false);
    expect(rockAfter?.assignedPlayerId).toBeUndefined();
    expect(cenaAfter?.isInUse).toBe(true);
    expect(cenaAfter?.assignedPlayerId).toBe(playerId);
  });

  it('clears currentWrestlerId when set to null and releases wrestler', async () => {
    const rock = await seedWrestler('The Rock');
    const createRes = await createPlayer(
      makeEvent({ body: JSON.stringify({ name: 'X', currentWrestlerId: rock.wrestlerId }) }),
      ctx,
      cb,
    );
    const playerId = JSON.parse(createRes!.body).playerId;

    const result = await updatePlayer(
      makeEvent({
        httpMethod: 'PUT',
        pathParameters: { playerId },
        body: JSON.stringify({ currentWrestlerId: null }),
      }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    const rockAfter = await repos.roster.wrestlers.findById(rock.wrestlerId);
    expect(rockAfter?.isInUse).toBe(false);
  });

  it('rejects with 409 when trying to pick another player’s wrestler', async () => {
    const rock = await seedWrestler('The Rock');
    await createPlayer(
      makeEvent({ body: JSON.stringify({ name: 'Owner', currentWrestlerId: rock.wrestlerId }) }),
      ctx,
      cb,
    );
    const other = await repos.roster.players.create({ name: 'Other', currentWrestler: 'Tmp' });

    const result = await updatePlayer(
      makeEvent({
        httpMethod: 'PUT',
        pathParameters: { playerId: other.playerId },
        body: JSON.stringify({ currentWrestlerId: rock.wrestlerId }),
      }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(409);
  });

  it('allows idempotent re-assignment of the same wrestler to same slot', async () => {
    const rock = await seedWrestler('The Rock');
    const createRes = await createPlayer(
      makeEvent({ body: JSON.stringify({ name: 'X', currentWrestlerId: rock.wrestlerId }) }),
      ctx,
      cb,
    );
    const playerId = JSON.parse(createRes!.body).playerId;

    const result = await updatePlayer(
      makeEvent({
        httpMethod: 'PUT',
        pathParameters: { playerId },
        body: JSON.stringify({ currentWrestlerId: rock.wrestlerId }),
      }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
  });
});

// ─── deletePlayer releases wrestlers ────────────────────────────────

describe('deletePlayer releases assigned wrestlers', () => {
  it('releases both primary and alternate on player delete', async () => {
    const rock = await seedWrestler('The Rock');
    const cena = await seedWrestler('John Cena');
    const createRes = await createPlayer(
      makeEvent({
        body: JSON.stringify({
          name: 'X',
          currentWrestlerId: rock.wrestlerId,
          alternateWrestlerId: cena.wrestlerId,
        }),
      }),
      ctx,
      cb,
    );
    const playerId = JSON.parse(createRes!.body).playerId;

    const result = await deletePlayer(
      makeEvent({ httpMethod: 'DELETE', pathParameters: { playerId } }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(204);

    const rockAfter = await repos.roster.wrestlers.findById(rock.wrestlerId);
    const cenaAfter = await repos.roster.wrestlers.findById(cena.wrestlerId);
    expect(rockAfter?.isInUse).toBe(false);
    expect(cenaAfter?.isInUse).toBe(false);
  });
});

// ─── updateMyProfile FK transitions ─────────────────────────────────

describe('updateMyProfile with FK fields', () => {
  it('allows self-service to swap primary wrestler via FK', async () => {
    const rock = await seedWrestler('The Rock');
    const cena = await seedWrestler('John Cena');
    const createRes = await createPlayer(
      makeEvent({ body: JSON.stringify({ name: 'X', currentWrestlerId: rock.wrestlerId }) }),
      ctx,
      cb,
    );
    const playerId = JSON.parse(createRes!.body).playerId;
    await repos.roster.players.update(playerId, { userId: 'user-sub-1' });

    const result = await updateMyProfile(
      withWrestlerAuth(
        makeEvent({
          httpMethod: 'PUT',
          body: JSON.stringify({ currentWrestlerId: cena.wrestlerId }),
        }),
      ),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).currentWrestlerId).toBe(cena.wrestlerId);
    expect(JSON.parse(result!.body).currentWrestler).toBe('John Cena');

    const rockAfter = await repos.roster.wrestlers.findById(rock.wrestlerId);
    expect(rockAfter?.isInUse).toBe(false);
  });

  it('rejects when self-service tries to claim another player’s wrestler', async () => {
    const rock = await seedWrestler('The Rock');
    await createPlayer(
      makeEvent({ body: JSON.stringify({ name: 'Owner', currentWrestlerId: rock.wrestlerId }) }),
      ctx,
      cb,
    );

    const me = await repos.roster.players.create({ name: 'Me', currentWrestler: 'Tmp' });
    await repos.roster.players.update(me.playerId, { userId: 'user-sub-1' });

    const result = await updateMyProfile(
      withWrestlerAuth(
        makeEvent({
          httpMethod: 'PUT',
          body: JSON.stringify({ currentWrestlerId: rock.wrestlerId }),
        }),
      ),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(409);
  });
});
