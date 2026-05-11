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
import { handler as getMyThreads } from '../getMyDirectMessageThreads';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

const LEADER_SUB = 'leader-sub';
const MEMBER_SUB = 'member-sub';
const THIRD_SUB = 'third-sub';
const OUTSIDER_SUB = 'outsider-sub';

function makeEvent(stableId: string, sub: string): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: `/stables/${stableId}/direct-messages`,
    pathParameters: { stableId },
    queryStringParameters: null,
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
  const third = await repos.roster.players.create({ name: 'Third', currentWrestler: 'Punk' });
  await repos.roster.players.update(third.playerId, { userId: THIRD_SUB });
  const outsider = await repos.roster.players.create({ name: 'Outsider', currentWrestler: 'Orton' });
  await repos.roster.players.update(outsider.playerId, { userId: OUTSIDER_SUB });

  const stable = await repos.roster.stables.create({
    name: 'NWO',
    leaderId: leader.playerId,
    memberIds: [leader.playerId, member.playerId, third.playerId],
    status: 'active',
  });

  return { leader, member, third, outsider, stable };
}

async function postN(
  factionId: string,
  senderPlayerId: string,
  recipientPlayerId: string,
  count: number,
  prefix = 'msg',
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
        body: `${prefix}-${i + 1}`,
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

describe('getMyDirectMessageThreads (FAC-06)', () => {
  it('returns one row per partner with the correct last message (even on a 300-message thread)', async () => {
    const { leader, member, third, stable } = await seed();

    // Thread A (leader ↔ member): 300 messages alternating
    for (let i = 0; i < 150; i++) {
      // Stagger to keep createdAt monotonic
      await postN(stable.stableId, leader.playerId, member.playerId, 1, `LM-out-${i}`);
      await postN(stable.stableId, member.playerId, leader.playerId, 1, `LM-in-${i}`);
    }

    // Thread B (leader ↔ third): just a couple of messages
    await postN(stable.stableId, leader.playerId, third.playerId, 1, 'LT-1');
    await postN(stable.stableId, third.playerId, leader.playerId, 1, 'LT-2');

    const result = await getMyThreads(
      makeEvent(stable.stableId, LEADER_SUB),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.items).toHaveLength(2);

    // Each row has the correct partner identity hydrated
    const byPartner = new Map<string, (typeof body.items)[number]>(
      body.items.map((r: { partnerPlayerId: string }) => [r.partnerPlayerId, r]),
    );
    const rowMember = byPartner.get(member.playerId)!;
    expect(rowMember.partnerPlayerName).toBe('Member');
    expect(rowMember.partnerWrestlerName).toBe('Cena');
    // Last message of the leader↔member thread is the final "LM-in-149-1" post
    expect(rowMember.lastMessage.body).toBe('LM-in-149-1');
    expect(rowMember.lastMessageAt).toBe(rowMember.lastMessage.createdAt);

    const rowThird = byPartner.get(third.playerId)!;
    expect(rowThird.partnerPlayerName).toBe('Third');
    expect(rowThird.partnerWrestlerName).toBe('Punk');
    expect(rowThird.lastMessage.body).toBe('LT-2-1');
  });

  // FAC-21: each thread row must carry the partner's imageUrl (or null when
  // they don't have one) so the frontend can render the actual profile pic
  // instead of the default placeholder on every row.
  it('hydrates partnerImageUrl from the partner player record', async () => {
    const { leader, member, third, stable } = await seed();
    await repos.roster.players.update(member.playerId, {
      imageUrl: 'https://example.com/member-portrait.jpg',
    });
    // `third` is intentionally left without an imageUrl so we exercise the null branch.

    await postN(stable.stableId, leader.playerId, member.playerId, 1, 'L1');
    await postN(stable.stableId, leader.playerId, third.playerId, 1, 'L2');

    const result = await getMyThreads(
      makeEvent(stable.stableId, LEADER_SUB),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const byPartner = new Map<string, (typeof body.items)[number]>(
      body.items.map((r: { partnerPlayerId: string }) => [r.partnerPlayerId, r]),
    );
    expect(byPartner.get(member.playerId)!.partnerImageUrl).toBe(
      'https://example.com/member-portrait.jpg',
    );
    expect(byPartner.get(third.playerId)!.partnerImageUrl).toBeNull();
  });

  it('returns 403 to a non-member of the faction', async () => {
    const { leader, member, stable } = await seed();
    await postN(stable.stableId, leader.playerId, member.playerId, 1);

    const result = await getMyThreads(
      makeEvent(stable.stableId, OUTSIDER_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(403);
  });

  it('returns an empty list for a member with no DMs', async () => {
    const { stable } = await seed();

    const result = await getMyThreads(
      makeEvent(stable.stableId, LEADER_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.items).toEqual([]);
  });

  it('returns 404 when the faction does not exist', async () => {
    await seed();

    const result = await getMyThreads(
      makeEvent('no-such-faction', LEADER_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    const { stable } = await seed();

    const result = await getMyThreads(
      makeEvent(stable.stableId, ''),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(401);
  });
});
