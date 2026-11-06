import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

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
import { handler as updateWrestler } from '../updateWrestler';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(wrestlerId: string, body: Record<string, unknown>): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'PUT',
    isBase64Encoded: false,
    path: `/wrestlers/${wrestlerId}`,
    pathParameters: { wrestlerId },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/wrestlers/{wrestlerId}',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

async function seedAssigned(slot: 'primary' | 'alternate' = 'primary') {
  const wrestler = await repos.roster.wrestlers.create({
    promotion: 'WWE',
    name: 'Cody Rhodes',
    overallCap: 90,
  });
  const player = await repos.roster.players.create({ name: 'Alice', currentWrestler: 'Other' });
  await repos.runInTransaction(async (tx) => {
    tx.assignWrestlerToPlayer({ wrestlerId: wrestler.wrestlerId, playerId: player.playerId, slot });
  });
  await repos.roster.players.update(
    player.playerId,
    slot === 'primary'
      ? { currentWrestlerId: wrestler.wrestlerId, currentWrestler: wrestler.name }
      : { alternateWrestlerId: wrestler.wrestlerId, alternateWrestler: wrestler.name },
  );
  return { wrestler, player };
}

describe('updateWrestler rename', () => {
  it('updates the name shown on the assigned player', async () => {
    const { wrestler, player } = await seedAssigned();

    const result = await updateWrestler(makeEvent(wrestler.wrestlerId, { name: 'The American Nightmare' }), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).name).toBe('The American Nightmare');
    expect((await repos.roster.players.findById(player.playerId))!.currentWrestler).toBe(
      'The American Nightmare',
    );
  });

  it('updates the alternate slot without touching the primary name', async () => {
    const { wrestler, player } = await seedAssigned('alternate');

    await updateWrestler(makeEvent(wrestler.wrestlerId, { name: 'Renamed' }), ctx, cb);

    const after = await repos.roster.players.findById(player.playerId);
    expect(after!.alternateWrestler).toBe('Renamed');
    expect(after!.currentWrestler).toBe('Other');
  });

  it('finishes a failed rename when the same name is sent again', async () => {
    const { wrestler, player } = await seedAssigned();
    const runInTransaction = repos.runInTransaction;
    repos.runInTransaction = vi.fn().mockRejectedValue(new Error('boom'));

    const failed = await updateWrestler(makeEvent(wrestler.wrestlerId, { name: 'Renamed' }), ctx, cb);

    expect(failed!.statusCode).toBe(500);
    expect((await repos.roster.players.findById(player.playerId))!.currentWrestler).toBe('Cody Rhodes');

    repos.runInTransaction = runInTransaction;
    const retried = await updateWrestler(makeEvent(wrestler.wrestlerId, { name: 'Renamed' }), ctx, cb);

    expect(retried!.statusCode).toBe(200);
    expect((await repos.roster.players.findById(player.playerId))!.currentWrestler).toBe('Renamed');
  });

  it('leaves players alone for a change that is not a rename', async () => {
    const { wrestler } = await seedAssigned();
    const runInTransaction = vi.spyOn(repos, 'runInTransaction');

    const result = await updateWrestler(makeEvent(wrestler.wrestlerId, { overallCap: 91 }), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(runInTransaction).not.toHaveBeenCalled();
  });
});

describe('updateWrestler release', () => {
  it('frees the wrestler and empties the player slot', async () => {
    const { wrestler, player } = await seedAssigned();

    const result = await updateWrestler(makeEvent(wrestler.wrestlerId, { isInUse: false }), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).isInUse).toBe(false);
    const wrestlerAfter = await repos.roster.wrestlers.findById(wrestler.wrestlerId);
    expect(wrestlerAfter!.assignedPlayerId).toBeUndefined();
    expect(wrestlerAfter!.assignedSlot).toBeUndefined();
    const playerAfter = await repos.roster.players.findById(player.playerId);
    expect(playerAfter!.currentWrestlerId).toBeUndefined();
    expect(playerAfter!.currentWrestler).toBe(NEEDS_WRESTLER);
  });

  it('clears every player holding the wrestler after a desync', async () => {
    const { wrestler, player } = await seedAssigned();
    const second = await repos.roster.players.create({ name: 'Bob', currentWrestler: wrestler.name });
    await repos.roster.players.update(second.playerId, { currentWrestlerId: wrestler.wrestlerId });

    await updateWrestler(makeEvent(wrestler.wrestlerId, { isInUse: false }), ctx, cb);

    for (const playerId of [player.playerId, second.playerId]) {
      expect((await repos.roster.players.findById(playerId))!.currentWrestlerId).toBeUndefined();
    }
  });

  it('applies other fields sent with the release', async () => {
    const { wrestler, player } = await seedAssigned();

    const result = await updateWrestler(
      makeEvent(wrestler.wrestlerId, { isInUse: false, name: 'Renamed' }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    const wrestlerAfter = await repos.roster.wrestlers.findById(wrestler.wrestlerId);
    expect(wrestlerAfter!.name).toBe('Renamed');
    expect(wrestlerAfter!.isInUse).toBe(false);
    expect((await repos.roster.players.findById(player.playerId))!.currentWrestler).toBe(NEEDS_WRESTLER);
  });

  it('changes nothing and reports a failure when the transaction fails', async () => {
    const { wrestler, player } = await seedAssigned();
    repos.runInTransaction = vi.fn().mockRejectedValue(new Error('boom'));

    const result = await updateWrestler(makeEvent(wrestler.wrestlerId, { isInUse: false }), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect((await repos.roster.wrestlers.findById(wrestler.wrestlerId))!.isInUse).toBe(true);
    expect((await repos.roster.players.findById(player.playerId))!.currentWrestlerId).toBe(
      wrestler.wrestlerId,
    );
  });

  it('returns 404 for an unknown wrestler', async () => {
    const result = await updateWrestler(makeEvent('missing', { isInUse: false }), ctx, cb);

    expect(result!.statusCode).toBe(404);
  });
});
