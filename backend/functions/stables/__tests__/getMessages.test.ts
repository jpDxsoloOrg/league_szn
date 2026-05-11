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
import { handler as getMessages } from '../getMessages';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

const LEADER_SUB = 'leader-sub';
const MEMBER_SUB = 'member-sub';
const OUTSIDER_SUB = 'outsider-sub';

function makeEvent(
  stableId: string,
  qs: Record<string, string> | null,
  groups: string,
  sub: string,
): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: `/stables/${stableId}/messages`,
    pathParameters: { stableId },
    queryStringParameters: qs,
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

async function postN(factionId: string, authorPlayerId: string, count: number): Promise<void> {
  // Stagger createdAt by a millisecond per message so newest-first sort is deterministic.
  let now = Date.now();
  const realNow = Date.now;
  Date.now = () => now;
  try {
    for (let i = 0; i < count; i++) {
      now += 1;
      vi.setSystemTime(new Date(now));
      await repos.factionMessages.post({
        factionId,
        authorPlayerId,
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

describe('getMessages (FAC-05)', () => {
  it('returns the feed in newest-first order for a member', async () => {
    const { member, stable } = await seed();
    await postN(stable.stableId, member.playerId, 3);

    const result = await getMessages(
      makeEvent(stable.stableId, null, 'Wrestler', MEMBER_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.items).toHaveLength(3);
    expect(body.items.map((m: { body: string }) => m.body)).toEqual(['msg-3', 'msg-2', 'msg-1']);
    expect(body.nextCursor).toBeUndefined();
  });

  it('returns 403 to a non-member', async () => {
    const { member, stable } = await seed();
    await postN(stable.stableId, member.playerId, 2);

    const result = await getMessages(
      makeEvent(stable.stableId, null, 'Wrestler', OUTSIDER_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(403);
  });

  it('paginates 60 messages with limit=20 across multiple pages', async () => {
    const { member, stable } = await seed();
    await postN(stable.stableId, member.playerId, 60);

    const firstPageResult = await getMessages(
      makeEvent(stable.stableId, { limit: '20' }, 'Wrestler', MEMBER_SUB),
      ctx,
      cb,
    );
    expect(firstPageResult!.statusCode).toBe(200);
    const firstPage = JSON.parse(firstPageResult!.body);
    expect(firstPage.items).toHaveLength(20);
    expect(firstPage.nextCursor).toBeTruthy();
    expect(firstPage.items[0].body).toBe('msg-60');
    expect(firstPage.items[19].body).toBe('msg-41');

    const secondPageResult = await getMessages(
      makeEvent(stable.stableId, { limit: '20', cursor: firstPage.nextCursor }, 'Wrestler', MEMBER_SUB),
      ctx,
      cb,
    );
    expect(secondPageResult!.statusCode).toBe(200);
    const secondPage = JSON.parse(secondPageResult!.body);
    expect(secondPage.items).toHaveLength(20);
    expect(secondPage.items[0].body).toBe('msg-40');
    expect(secondPage.items[19].body).toBe('msg-21');
    expect(secondPage.nextCursor).toBeTruthy();

    // The two pages must not overlap.
    const firstIds = new Set(firstPage.items.map((m: { messageId: string }) => m.messageId));
    for (const m of secondPage.items) {
      expect(firstIds.has(m.messageId)).toBe(false);
    }
  });
});
