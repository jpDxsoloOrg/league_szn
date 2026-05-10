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
import { handler as removeMember } from '../removeMember';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

const LEADER_SUB = 'leader-sub';
const MEMBER1_SUB = 'member1-sub';
const MEMBER2_SUB = 'member2-sub';
const OTHER_SUB = 'other-sub';
const ADMIN_SUB = 'admin-sub';

function makeEvent(stableId: string, body: unknown, groups: string, sub: string): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: `/stables/${stableId}/remove-member`,
    pathParameters: { stableId },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      authorizer: { groups, username: 'tester', email: 'test@test.com', principalId: sub },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

async function seed() {
  const leader = await repos.roster.players.create({ name: 'Leader', currentWrestler: 'Rock' });
  await repos.roster.players.update(leader.playerId, { userId: LEADER_SUB });
  const member1 = await repos.roster.players.create({ name: 'Member1', currentWrestler: 'Cena' });
  await repos.roster.players.update(member1.playerId, { userId: MEMBER1_SUB });
  const member2 = await repos.roster.players.create({ name: 'Member2', currentWrestler: 'Edge' });
  await repos.roster.players.update(member2.playerId, { userId: MEMBER2_SUB });
  const other = await repos.roster.players.create({ name: 'Other', currentWrestler: 'Orton' });
  await repos.roster.players.update(other.playerId, { userId: OTHER_SUB });

  return { leader, member1, member2, other };
}

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

describe('removeMember (FAC-02)', () => {
  it('lets the leader remove a member', async () => {
    const { leader, member1, member2 } = await seed();
    const stable = await repos.roster.stables.create({
      name: 'NWO',
      leaderId: leader.playerId,
      memberIds: [leader.playerId, member1.playerId, member2.playerId],
      status: 'active',
    });
    await repos.roster.players.update(member1.playerId, { stableId: stable.stableId });

    const event = makeEvent(stable.stableId, { playerId: member1.playerId }, 'Wrestler', LEADER_SUB);
    const result = await removeMember(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.removedPlayerId).toBe(member1.playerId);
    expect(body.remainingMembers).toBe(2);

    const updated = await repos.roster.stables.findById(stable.stableId);
    expect(updated?.memberIds).toEqual([leader.playerId, member2.playerId]);
    expect(updated?.status).toBe('active');

    const updatedPlayer = await repos.roster.players.findById(member1.playerId);
    expect(updatedPlayer?.stableId).toBeNull();
  });

  it('lets a super admin remove a member they are not part of', async () => {
    const { leader, member1, member2 } = await seed();
    const stable = await repos.roster.stables.create({
      name: 'NWO',
      leaderId: leader.playerId,
      memberIds: [leader.playerId, member1.playerId, member2.playerId],
      status: 'active',
    });

    // Admin caller has no player profile; the handler should still allow the call.
    const event = makeEvent(stable.stableId, { playerId: member1.playerId }, 'Admin', ADMIN_SUB);
    const result = await removeMember(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const updated = await repos.roster.stables.findById(stable.stableId);
    expect(updated?.memberIds).toEqual([leader.playerId, member2.playerId]);
  });

  it('lets a member remove themselves', async () => {
    const { leader, member1, member2 } = await seed();
    const stable = await repos.roster.stables.create({
      name: 'NWO',
      leaderId: leader.playerId,
      memberIds: [leader.playerId, member1.playerId, member2.playerId],
      status: 'active',
    });

    const event = makeEvent(stable.stableId, { playerId: member1.playerId }, 'Wrestler', MEMBER1_SUB);
    const result = await removeMember(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
  });

  it('returns 403 when a non-leader, non-admin, non-self caller tries to remove someone else', async () => {
    const { leader, member1, member2 } = await seed();
    const stable = await repos.roster.stables.create({
      name: 'NWO',
      leaderId: leader.playerId,
      memberIds: [leader.playerId, member1.playerId, member2.playerId],
      status: 'active',
    });

    // The "other" player is not a member of the stable and is not an admin or leader.
    const event = makeEvent(stable.stableId, { playerId: member1.playerId }, 'Wrestler', OTHER_SUB);
    const result = await removeMember(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
    const updated = await repos.roster.stables.findById(stable.stableId);
    expect(updated?.memberIds).toEqual([leader.playerId, member1.playerId, member2.playerId]);
  });

  it('auto-disbands the faction when removing the last non-leader member', async () => {
    const { leader, member1 } = await seed();
    const stable = await repos.roster.stables.create({
      name: 'Solo',
      leaderId: leader.playerId,
      memberIds: [leader.playerId, member1.playerId],
      status: 'active',
    });
    await repos.roster.players.update(leader.playerId, { stableId: stable.stableId });
    await repos.roster.players.update(member1.playerId, { stableId: stable.stableId });

    const event = makeEvent(stable.stableId, { playerId: member1.playerId }, 'Wrestler', LEADER_SUB);
    const result = await removeMember(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.status).toBe('disbanded');

    const updated = await repos.roster.stables.findById(stable.stableId);
    expect(updated?.status).toBe('disbanded');
    expect(updated?.memberIds).toEqual([leader.playerId]);
    expect(updated?.disbandedAt).toBeDefined();

    const ejected = await repos.roster.players.findById(member1.playerId);
    expect(ejected?.stableId).toBeNull();
    const orphanedLeader = await repos.roster.players.findById(leader.playerId);
    expect(orphanedLeader?.stableId).toBeNull();
  });
});
