import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

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
import { handler as resetAssignments } from '../resetAssignments';

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
    path: '/wrestlers/reset-assignments',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/wrestlers/reset-assignments',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

async function seedWrestler(name: string) {
  return repos.roster.wrestlers.create({ promotion: 'WWE', name, overallCap: 90 });
}

async function seedPlayer(name: string) {
  return repos.roster.players.create({ name, currentWrestler: '' });
}

describe('resetAssignments', () => {
  it('returns zeros as a no-op when nothing is assigned', async () => {
    await seedWrestler('Cody Rhodes');
    await seedPlayer('Alice');

    const result = await resetAssignments(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual({
      clearedWrestlers: 0,
      clearedPlayers: 0,
    });
  });

  it('clears every assigned wrestler and player FK, returning counts', async () => {
    const wrestlerOne = await seedWrestler('Cody Rhodes');
    const wrestlerTwo = await seedWrestler('MJF');
    const unassigned = await seedWrestler('Kazuchika Okada');

    const playerOne = await seedPlayer('Alice');
    const playerTwo = await seedPlayer('Bob');

    await repos.runInTransaction(async (tx) => {
      tx.assignWrestlerToPlayer({
        wrestlerId: wrestlerOne.wrestlerId,
        playerId: playerOne.playerId,
        slot: 'primary',
      });
      tx.assignWrestlerToPlayer({
        wrestlerId: wrestlerTwo.wrestlerId,
        playerId: playerTwo.playerId,
        slot: 'alternate',
      });
    });
    await repos.roster.players.update(playerOne.playerId, {
      currentWrestlerId: wrestlerOne.wrestlerId,
      currentWrestler: wrestlerOne.name,
    });
    await repos.roster.players.update(playerTwo.playerId, {
      alternateWrestlerId: wrestlerTwo.wrestlerId,
      alternateWrestler: wrestlerTwo.name,
    });

    const result = await resetAssignments(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual({
      clearedWrestlers: 2,
      clearedPlayers: 2,
    });

    const clearedOne = await repos.roster.wrestlers.findById(wrestlerOne.wrestlerId);
    const clearedTwo = await repos.roster.wrestlers.findById(wrestlerTwo.wrestlerId);
    expect(clearedOne!.isInUse).toBe(false);
    expect(clearedOne!.assignedPlayerId).toBeUndefined();
    expect(clearedOne!.assignedSlot).toBeUndefined();
    expect(clearedTwo!.isInUse).toBe(false);
    expect(clearedTwo!.assignedPlayerId).toBeUndefined();

    const untouched = await repos.roster.wrestlers.findById(unassigned.wrestlerId);
    expect(untouched!.isInUse).toBe(false);

    const freedPlayerOne = await repos.roster.players.findById(playerOne.playerId);
    expect(freedPlayerOne!.currentWrestlerId).toBeUndefined();
    expect(freedPlayerOne!.currentWrestler).toBe('');

    const freedPlayerTwo = await repos.roster.players.findById(playerTwo.playerId);
    expect(freedPlayerTwo!.alternateWrestlerId).toBeUndefined();
    expect(freedPlayerTwo!.alternateWrestler).toBeUndefined();
  });

  it('releases wrestlers flagged in-use even without an assignedPlayerId', async () => {
    const wrestler = await seedWrestler('Cody Rhodes');
    // Admin-toggled isInUse without an FK link (legacy P0 toggle).
    await repos.roster.wrestlers.update(wrestler.wrestlerId, { isInUse: true });

    const result = await resetAssignments(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual({
      clearedWrestlers: 1,
      clearedPlayers: 0,
    });

    const released = await repos.roster.wrestlers.findById(wrestler.wrestlerId);
    expect(released!.isInUse).toBe(false);
  });
});
