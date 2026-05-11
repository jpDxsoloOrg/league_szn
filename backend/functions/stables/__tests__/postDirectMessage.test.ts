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
import { handler as postDirectMessage } from '../postDirectMessage';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

const LEADER_SUB = 'leader-sub';
const MEMBER_SUB = 'member-sub';
const OUTSIDER_SUB = 'outsider-sub';

function makeEvent(stableId: string, body: unknown, sub: string): APIGatewayProxyEvent {
  return {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
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

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

describe('postDirectMessage (FAC-06)', () => {
  it('lets two members DM each other and computes a deterministic threadKey', async () => {
    const { leader, member, stable } = await seed();

    const result = await postDirectMessage(
      makeEvent(stable.stableId, { recipientPlayerId: member.playerId, body: '  Hi there  ' }, LEADER_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(201);
    const created = JSON.parse(result!.body);
    expect(created.factionId).toBe(stable.stableId);
    expect(created.senderPlayerId).toBe(leader.playerId);
    expect(created.recipientPlayerId).toBe(member.playerId);
    expect(created.body).toBe('Hi there');
    expect(created.threadKey).toBe(buildThreadKey(leader.playerId, member.playerId));

    // Persisted in the repo
    const page = await repos.factionDirectMessages.listThread(stable.stableId, created.threadKey);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].body).toBe('Hi there');
  });

  it('returns 403 with errorKey=not_both_members when recipient is not in the faction', async () => {
    const { member, outsider, stable } = await seed();

    const result = await postDirectMessage(
      makeEvent(stable.stableId, { recipientPlayerId: outsider.playerId, body: 'hello' }, MEMBER_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(403);
    const body = JSON.parse(result!.body);
    expect(body.errorKey).toBe('not_both_members');

    // Nothing persisted — neither side has any threads
    const memberThreads = await repos.factionDirectMessages.listThreadsForPlayer(
      stable.stableId,
      member.playerId,
    );
    expect(memberThreads).toEqual([]);
    const outsiderThreads = await repos.factionDirectMessages.listThreadsForPlayer(
      stable.stableId,
      outsider.playerId,
    );
    expect(outsiderThreads).toEqual([]);
  });

  it('returns 403 not_both_members when the caller themselves is not in the faction', async () => {
    const { member, stable } = await seed();

    const result = await postDirectMessage(
      makeEvent(stable.stableId, { recipientPlayerId: member.playerId, body: 'hi' }, OUTSIDER_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(403);
    const body = JSON.parse(result!.body);
    expect(body.errorKey).toBe('not_both_members');
  });

  it('rejects a self-DM with 400', async () => {
    const { leader, stable } = await seed();

    const result = await postDirectMessage(
      makeEvent(stable.stableId, { recipientPlayerId: leader.playerId, body: 'note to self' }, LEADER_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(400);
  });

  it('returns 400 for an empty or whitespace-only body', async () => {
    const { member, stable } = await seed();

    const blank = await postDirectMessage(
      makeEvent(stable.stableId, { recipientPlayerId: member.playerId, body: '   ' }, LEADER_SUB),
      ctx,
      cb,
    );
    expect(blank!.statusCode).toBe(400);

    const empty = await postDirectMessage(
      makeEvent(stable.stableId, { recipientPlayerId: member.playerId, body: '' }, LEADER_SUB),
      ctx,
      cb,
    );
    expect(empty!.statusCode).toBe(400);
  });

  it('returns 400 for a body longer than 2000 chars', async () => {
    const { member, stable } = await seed();

    const result = await postDirectMessage(
      makeEvent(
        stable.stableId,
        { recipientPlayerId: member.playerId, body: 'a'.repeat(2001) },
        LEADER_SUB,
      ),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(400);
  });

  it('returns 400 when recipientPlayerId is missing', async () => {
    const { stable } = await seed();

    const result = await postDirectMessage(
      makeEvent(stable.stableId, { body: 'hello' }, LEADER_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(400);
  });

  it('returns 404 when the faction does not exist', async () => {
    await seed();

    const result = await postDirectMessage(
      makeEvent('does-not-exist', { recipientPlayerId: 'whoever', body: 'hi' }, LEADER_SUB),
      ctx,
      cb,
    );

    // Caller has a player but with no faction match — surfaces as 404
    expect(result!.statusCode).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    const { member, stable } = await seed();

    const event = makeEvent(stable.stableId, { recipientPlayerId: member.playerId, body: 'hi' }, '');
    const result = await postDirectMessage(event, ctx, cb);

    expect(result!.statusCode).toBe(401);
  });
});
