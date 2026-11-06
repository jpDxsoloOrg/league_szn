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

async function invitedPlayerIdsFor(id: string, groups: string, sub: string) {
  const result = await getInvitations(makeEvent(id, groups, sub), ctx, cb);
  expect(result?.statusCode).toBe(200);
  const rows = JSON.parse(result!.body) as Array<{ invitedPlayerId: string }>;
  return rows.map((row) => row.invitedPlayerId).sort();
}

async function invite(invitedPlayerId: string, invitedByPlayerId: string) {
  await repos.roster.stables.createInvitation({
    stableId,
    invitedPlayerId,
    invitedByPlayerId,
    message: 'Join us',
    expiresAt: '2099-01-01T00:00:00.000Z',
  });
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

  it('gives a wrestler with no invitation an empty list, not an error', async () => {
    const leader = await repos.roster.players.findByUserId('leader-sub');
    const other = await addPlayer('Other', 'other-sub');
    await invite(other.playerId, leader!.playerId);

    expect(await invitedPlayerIdsFor(stableId, 'Wrestler', 'outsider-sub')).toEqual([]);
  });

  it('shows an invited player only the invitations addressed to them', async () => {
    const leader = await repos.roster.players.findByUserId('leader-sub');
    const invited = await addPlayer('Invited', 'invited-sub');
    const other = await addPlayer('Other', 'other-sub');
    await invite(invited.playerId, leader!.playerId);
    await invite(other.playerId, leader!.playerId);

    expect(await invitedPlayerIdsFor(stableId, 'Wrestler', 'invited-sub')).toEqual([invited.playerId]);
  });

  it('shows the leader, members and staff every invitation', async () => {
    const leader = await repos.roster.players.findByUserId('leader-sub');
    const invited = await addPlayer('Invited', 'invited-sub');
    const other = await addPlayer('Other', 'other-sub');
    await invite(invited.playerId, leader!.playerId);
    await invite(other.playerId, leader!.playerId);
    const everyone = [invited.playerId, other.playerId].sort();

    expect(await invitedPlayerIdsFor(stableId, 'Wrestler', 'leader-sub')).toEqual(everyone);
    expect(await invitedPlayerIdsFor(stableId, 'Wrestler', 'member-sub')).toEqual(everyone);
    expect(await invitedPlayerIdsFor(stableId, 'Moderator', 'staff-sub')).toEqual(everyone);
  });

  it('gives a wrestler with no player record an empty list', async () => {
    expect(await invitedPlayerIdsFor(stableId, 'Wrestler', 'no-player-sub')).toEqual([]);
  });

  it('lets staff without a player record read invitations', async () => {
    expect(await statusFor(stableId, 'Moderator', 'staff-sub')).toBe(200);
  });

  it('returns 404 for an unknown stable', async () => {
    expect(await statusFor('missing', 'Wrestler', 'leader-sub')).toBe(404);
  });
});
