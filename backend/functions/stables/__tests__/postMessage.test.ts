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
import { handler as postMessage } from '../postMessage';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

const LEADER_SUB = 'leader-sub';
const MEMBER_SUB = 'member-sub';
const OUTSIDER_SUB = 'outsider-sub';
const ADMIN_SUB = 'admin-sub';

function makeEvent(stableId: string, body: unknown, groups: string, sub: string): APIGatewayProxyEvent {
  return {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: `/stables/${stableId}/messages`,
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

describe('postMessage (FAC-05)', () => {
  it('lets a member post a user message and persists it with authorPlayerId = caller', async () => {
    const { member, stable } = await seed();

    const event = makeEvent(
      stable.stableId,
      { body: '  Hello faction  ' },
      'Wrestler',
      MEMBER_SUB,
    );
    const result = await postMessage(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const created = JSON.parse(result!.body);
    expect(created.factionId).toBe(stable.stableId);
    expect(created.authorPlayerId).toBe(member.playerId);
    expect(created.body).toBe('Hello faction');
    expect(created.messageType).toBe('user');
    expect(created.messageId).toBeTruthy();
    expect(created.createdAt).toBeTruthy();

    const page = await repos.factionMessages.list(stable.stableId);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].body).toBe('Hello faction');
  });

  it('returns 403 when a non-member tries to post', async () => {
    const { stable } = await seed();

    const event = makeEvent(
      stable.stableId,
      { body: 'I am not in this faction' },
      'Wrestler',
      OUTSIDER_SUB,
    );
    const result = await postMessage(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
    const page = await repos.factionMessages.list(stable.stableId);
    expect(page.items).toHaveLength(0);
  });

  it('returns 400 for an empty body', async () => {
    const { stable } = await seed();

    const blank = await postMessage(
      makeEvent(stable.stableId, { body: '   ' }, 'Wrestler', MEMBER_SUB),
      ctx,
      cb,
    );
    expect(blank!.statusCode).toBe(400);

    const empty = await postMessage(
      makeEvent(stable.stableId, { body: '' }, 'Wrestler', MEMBER_SUB),
      ctx,
      cb,
    );
    expect(empty!.statusCode).toBe(400);
  });

  it('returns 400 for a body longer than 2000 chars', async () => {
    const { stable } = await seed();

    const longBody = 'a'.repeat(2001);
    const result = await postMessage(
      makeEvent(stable.stableId, { body: longBody }, 'Wrestler', MEMBER_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(400);
  });

  it('rejects non-admins attempting messageType=system with 403', async () => {
    const { stable } = await seed();

    const result = await postMessage(
      makeEvent(
        stable.stableId,
        { body: 'X joined the faction', messageType: 'system' },
        'Wrestler',
        MEMBER_SUB,
      ),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(403);
    const page = await repos.factionMessages.list(stable.stableId);
    expect(page.items).toHaveLength(0);
  });

  it('lets an admin who is not a member post a message', async () => {
    const { stable } = await seed();

    // Admin caller has no player profile in the faction.
    const result = await postMessage(
      makeEvent(stable.stableId, { body: 'Admin notice' }, 'Admin', ADMIN_SUB),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(201);
    const created = JSON.parse(result!.body);
    expect(created.messageType).toBe('user');

    const page = await repos.factionMessages.list(stable.stableId);
    expect(page.items).toHaveLength(1);
  });

  it('lets an admin post a system message', async () => {
    const { stable } = await seed();

    const result = await postMessage(
      makeEvent(
        stable.stableId,
        { body: 'Bron Breakker joined the faction', messageType: 'system' },
        'Admin',
        ADMIN_SUB,
      ),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(201);
    const created = JSON.parse(result!.body);
    expect(created.messageType).toBe('system');
  });
});
