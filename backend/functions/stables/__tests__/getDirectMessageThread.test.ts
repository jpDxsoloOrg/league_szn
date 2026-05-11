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
import { buildThreadKey } from '../../../lib/repositories/factionMessages';
import { handler as getDirectMessageThread } from '../getDirectMessageThread';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

const LEADER_SUB = 'leader-sub';
const MEMBER_SUB = 'member-sub';
const OUTSIDER_SUB = 'outsider-sub';

function makeEvent(
  stableId: string,
  partnerPlayerId: string,
  qs: Record<string, string> | null,
  sub: string,
): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: `/stables/${stableId}/direct-messages/${partnerPlayerId}`,
    pathParameters: { stableId, partnerPlayerId },
    queryStringParameters: qs,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      authorizer: { groups: 'Wrestler', username: 'tester', email: 't@t.com', principalId: sub },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

async function seed() {
  const leader = await repos.roster.players.create({ name: 'Leader', currentWrestler: 'Rock' });
  await repos.roster.players.update(leader.playerId, { userId: LEADER_SUB });
  const member = await repos.roster.players.create({ name: 'Member', currentWrestler: 'Cena' });
  await repos.roster.players.update(member.playerId, { userId: MEMBER_SUB });
  const outsider = await repos.roster.players.create({ name: 'Outsider', currentWrestler: 'Orton' });
  await repos.roster.players.update(outsider.playerId, { userId: OUTSIDER_SUB });

  const stable = await repos.roster.stables.create({
    name: 'NWO',
    leaderId: leader.playerId,
    memberIds: [leader.playerId, member.playerId],
    status: 'active',
  });

  return { leader, member, outsider, stable };
}

async function postN(
  factionId: string,
  senderPlayerId: string,
  recipientPlayerId: string,
  count: number,
): Promise<void> {
  let now = Date.now();
  const realNow = Date.now;
  Date.now = () => now;
  try {
    for (let i = 0; i < count; i++) {
      now += 1;
      vi.setSystemTime(new Date(now));
      await repos.factionDirectMessages.post({
        factionId,
        senderPlayerId,
        recipientPlayerId,
        body: `msg-${i + 1}`,
      });
    }
  } finally {
    Date.now = realNow;
    vi.useRealTimers();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

describe('getDirectMessageThread (FAC-06)', () => {
  it('returns the thread newest-first to either participant', async () => {
    const { leader, member, stable } = await seed();
    await postN(stable.stableId, leader.playerId, member.playerId, 3);

    // Leader reads the thread keyed by their partner = member
    const asLeader = await getDirectMessageThread(
      makeEvent(stable.stableId, member.playerId, null, LEADER_SUB),
      ctx,
      cb,
    );
    expect(asLeader!.statusCode).toBe(200);
    const leaderPage = JSON.parse(asLeader!.body);
    expect(leaderPage.items).toHaveLength(3);
    expect(leaderPage.items.map((m: { body: string }) => m.body)).toEqual([
      'msg-3',
      'msg-2',
      'msg-1',
    ]);

    // Member reads the same thread keyed by their partner = leader
    const asMember = await getDirectMessageThread(
      makeEvent(stable.stableId, leader.playerId, null, MEMBER_SUB),
      ctx,
      cb,
    );
    expect(asMember!.statusCode).toBe(200);
    const memberPage = JSON.parse(asMember!.body);
    expect(memberPage.items).toHaveLength(3);
    expect(memberPage.items[0].threadKey).toBe(buildThreadKey(leader.playerId, member.playerId));
  });

  it('returns 403 to a non-member trying to read any thread', async () => {
    const { leader, member, stable } = await seed();
    await postN(stable.stableId, leader.playerId, member.playerId, 2);

    const result = await getDirectMessageThread(
      makeEvent(stable.stableId, member.playerId, null, OUTSIDER_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(403);
  });

  it('returns 404 when the partner is not in the faction (no enumeration leak)', async () => {
    const { outsider, stable } = await seed();

    const result = await getDirectMessageThread(
      makeEvent(stable.stableId, outsider.playerId, null, LEADER_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(404);
  });

  it('returns 404 when the partner does not exist at all', async () => {
    const { stable } = await seed();

    const result = await getDirectMessageThread(
      makeEvent(stable.stableId, 'no-such-player', null, LEADER_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(404);
  });

  it('blocks a previously-member after they are removed from the faction', async () => {
    const { leader, member, stable } = await seed();
    await postN(stable.stableId, leader.playerId, member.playerId, 2);

    // Sanity: while a member, the user can read the thread
    const before = await getDirectMessageThread(
      makeEvent(stable.stableId, leader.playerId, null, MEMBER_SUB),
      ctx,
      cb,
    );
    expect(before!.statusCode).toBe(200);

    // Remove the member from the faction (mimics the FAC-02 removal path)
    await repos.roster.stables.update(stable.stableId, {
      memberIds: [leader.playerId],
    });

    const after = await getDirectMessageThread(
      makeEvent(stable.stableId, leader.playerId, null, MEMBER_SUB),
      ctx,
      cb,
    );
    expect(after!.statusCode).toBe(403);
  });

  it('rejects self-as-partner with 404 (caller cannot DM themselves)', async () => {
    const { leader, stable } = await seed();

    const result = await getDirectMessageThread(
      makeEvent(stable.stableId, leader.playerId, null, LEADER_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(404);
  });

  it('returns 404 when the faction does not exist', async () => {
    const { member } = await seed();

    const result = await getDirectMessageThread(
      makeEvent('no-such-faction', member.playerId, null, LEADER_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(404);
  });
});
