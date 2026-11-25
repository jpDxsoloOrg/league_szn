import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context, Callback } from 'aws-lambda';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});

import { setRepositoriesForTesting, resetRepositoriesForTesting, type Repositories } from '../../../lib/repositories';
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import { handler } from '../runInjuryRecovery';

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(groups: string): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/admin/injury-recovery',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/admin/injury-recovery',
    requestContext: {
      authorizer: { groups, username: 'gm-jane', email: 'jane@test.com', principalId: 'sub-1' },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

function parse(result: APIGatewayProxyResult | void) {
  return { status: result!.statusCode, body: JSON.parse(result!.body) };
}

let repos: Repositories;

beforeEach(async () => {
  vi.useFakeTimers();
  // Sunday 22 Nov 2026, 00:05 in New York.
  vi.setSystemTime(new Date('2026-11-22T05:05:00.000Z'));
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  await repos.user.siteConfig.updateFeatures({ injuries: true });
});

afterEach(() => {
  vi.useRealTimers();
  resetRepositoriesForTesting();
});

// INJ-05
describe('POST /admin/injury-recovery', () => {
  it('is Admin only', async () => {
    expect(parse(await handler(makeEvent('Moderator'), ctx, cb)).status).toBe(403);
  });

  it('runs this week once, with the same claim as the weekly job', async () => {
    const { playerId } = await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock' });
    await repos.runInTransaction(async (tx) => {
      tx.updatePlayerCondition(playerId, { stamina: 20 });
    });

    const first = parse(await handler(makeEvent('Admin'), ctx, cb));
    const second = parse(await handler(makeEvent('Admin'), ctx, cb));

    expect(first).toMatchObject({ status: 200, body: { status: 'recovered', weekKey: '2026-11-22', staminaRecovered: 1 } });
    expect(second.body.status).toBe('alreadyRun');
    expect((await repos.roster.players.findById(playerId))?.stamina).toBe(100);
  });
});
