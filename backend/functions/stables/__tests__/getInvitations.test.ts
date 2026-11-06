import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as getInvitations } from '../getInvitations';

let repos: Repositories;
let stableId: string;
const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(id: string, groups: string, sub: string): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: `/stables/${id}/invitations`,
    pathParameters: { stableId: id },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      authorizer: { groups, username: 'tester', email: 'test@test.com', principalId: sub },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

async function addPlayer(name: string, sub: string) {
  const player = await repos.roster.players.create({ name, currentWrestler: `${name} Wrestler` });
  await repos.roster.players.update(player.playerId, { userId: sub });
  return player;
}

async function statusFor(id: string, groups: string, sub: string) {
  const result = await getInvitations(makeEvent(id, groups, sub), ctx, cb);
  return result?.statusCode;
}

describe('getInvitations', () => {
  beforeEach(async () => {
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);
    const leader = await addPlayer('Leader', 'leader-sub');
    const member = await addPlayer('Member', 'member-sub');
    await addPlayer('Outsider', 'outsider-sub');
    const stable = await repos.roster.stables.create({ name: 'Crew', leaderId: leader.playerId, memberIds: [leader.playerId] });
    await repos.roster.stables.update(stable.stableId, { memberIds: [leader.playerId, member.playerId] });
    stableId = stable.stableId;
  });

  afterEach(() => {
    resetRepositoriesForTesting();
  });

  it('lets the leader and members read invitations', async () => {
    expect(await statusFor(stableId, 'Wrestler', 'leader-sub')).toBe(200);
    expect(await statusFor(stableId, 'Wrestler', 'member-sub')).toBe(200);
  });

  it('refuses a wrestler outside the stable', async () => {
    expect(await statusFor(stableId, 'Wrestler', 'outsider-sub')).toBe(403);
  });

  it('lets staff without a player record read invitations', async () => {
    expect(await statusFor(stableId, 'Moderator', 'staff-sub')).toBe(200);
  });

  it('returns 404 for an unknown stable', async () => {
    expect(await statusFor('missing', 'Wrestler', 'leader-sub')).toBe(404);
  });
});
