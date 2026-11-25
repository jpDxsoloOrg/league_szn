import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context, Callback } from 'aws-lambda';
import { setRepositoriesForTesting, resetRepositoriesForTesting } from '../../../lib/repositories';
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import { DEFAULT_INJURY_TUNABLES } from '../../../lib/policies/fatigueDefaults';
import { handler as getInjuryConfig } from '../getInjuryConfig';
import { handler as updateInjuryConfig } from '../updateInjuryConfig';

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(groups: string, body?: unknown): APIGatewayProxyEvent {
  return {
    body: body === undefined ? null : JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: body === undefined ? 'GET' : 'PUT',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      authorizer: { groups, username: 'gm-jane', email: 'jane@test.com', principalId: 'sub-1' },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

function parse(result: APIGatewayProxyResult | void) {
  return { status: result!.statusCode, body: JSON.parse(result!.body) };
}

let siteConfigRepo: ReturnType<typeof buildInMemoryRepositories>['user']['siteConfig'];

beforeEach(() => {
  const repos = buildInMemoryRepositories();
  siteConfigRepo = repos.user.siteConfig;
  setRepositoriesForTesting(repos);
});

afterEach(() => {
  resetRepositoriesForTesting();
});

const save = async (settings: unknown, expectedVersion?: number) =>
  parse(await updateInjuryConfig(makeEvent('Admin', { settings, expectedVersion }), ctx, cb));

describe('GET /admin/injury-config (INJ-01)', () => {
  it('returns the defaults and an empty history to a Moderator before anything is saved', async () => {
    const { status, body } = parse(await getInjuryConfig(makeEvent('Moderator'), ctx, cb));
    expect(status).toBe(200);
    expect(body).toEqual({ settings: DEFAULT_INJURY_TUNABLES, history: [] });
  });

  it('refuses a Wrestler', async () => {
    expect(parse(await getInjuryConfig(makeEvent('Wrestler'), ctx, cb)).status).toBe(403);
  });

  it('lists who saved each version, newest first', async () => {
    await save({ simInjuredPenalty: 0.7 });
    await save({ simInjuredPenalty: 0.6 });

    const { body } = parse(await getInjuryConfig(makeEvent('Admin'), ctx, cb));

    expect(body.settings).toMatchObject({ version: 2, simInjuredPenalty: 0.6 });
    expect(body.history.map((entry: { version: number }) => entry.version)).toEqual([2, 1]);
    expect(body.history[0]).toEqual({ version: 2, updatedAt: expect.any(String), updatedBy: 'gm-jane' });
  });
});

describe('PUT /admin/injury-config (INJ-01)', () => {
  it('merges a partial update, bumps the version and records who saved it', async () => {
    const { status, body } = await save({ drainByCategory: { cage: 40 }, timezone: 'Europe/Berlin' });

    expect(status).toBe(200);
    expect(body.settings).toMatchObject({ version: 1, updatedBy: 'gm-jane', timezone: 'Europe/Berlin' });
    expect(body.settings.drainByCategory).toEqual({ ...DEFAULT_INJURY_TUNABLES.drainByCategory, cage: 40 });
    expect(typeof body.settings.updatedAt).toBe('string');
    expect((await siteConfigRepo.getInjuryTunables()).timezone).toBe('Europe/Berlin');
  });

  it('keeps the previous versions so old rolls stay explainable', async () => {
    await save({ weeklyRecovery: 30 });
    await save({ weeklyRecovery: 50 });

    const versions = await siteConfigRepo.listInjuryTunablesVersions();
    expect(versions.map((version) => [version.version, version.weeklyRecovery])).toEqual([[2, 50], [1, 30]]);
  });

  it('replaces the chance bands and the format map instead of merging them', async () => {
    const bands = [{ minStamina: 50, chance: 0.02 }, { minStamina: 0, chance: 0.2 }];
    const { body } = await save({ injuryChanceBands: bands, formatMultiplier: { singles: 1, tag: 0.5 } });

    expect(body.settings.injuryChanceBands).toEqual(bands);
    expect(body.settings.formatMultiplier).toEqual({ singles: 1, tag: 0.5 });
  });

  it('refuses a Moderator without saving', async () => {
    const result = parse(await updateInjuryConfig(makeEvent('Moderator', { settings: { maxStamina: 90 } }), ctx, cb));
    expect(result.status).toBe(403);
    expect((await siteConfigRepo.getInjuryTunables()).version).toBe(0);
  });

  it.each([
    [{ injuryChanceBands: [{ minStamina: 0, chance: 0.1 }, { minStamina: 50, chance: 0.1 }] }, 'sorted'],
    [{ timezone: 'Nowhere/Special' }, 'timezone'],
    [{ categoryRisk: { cage: -1 } }, 'categoryRisk.cage'],
    [{ formatMultiplier: { tag: 'lots' } }, 'formatMultiplier.tag'],
  ])('rejects %j without saving', async (settings, message) => {
    const result = await save(settings);
    expect(result.status).toBe(400);
    expect(result.body.message).toContain(message);
    expect((await siteConfigRepo.getInjuryTunables()).version).toBe(0);
  });

  it('rejects a missing settings object and a bad expectedVersion', async () => {
    expect(parse(await updateInjuryConfig(makeEvent('Admin', {}), ctx, cb)).status).toBe(400);
    expect(parse(await updateInjuryConfig(makeEvent('Admin', { settings: [] }), ctx, cb)).status).toBe(400);
    expect((await save({}, -1)).status).toBe(400);
  });

  it('returns 409 when expectedVersion is stale', async () => {
    expect((await save({ maxStamina: 120 }, 0)).status).toBe(200);
    const stale = await save({ maxStamina: 150 }, 0);

    expect(stale.status).toBe(409);
    expect((await siteConfigRepo.getInjuryTunables()).maxStamina).toBe(120);
  });

  it('saves when expectedVersion matches', async () => {
    await save({ maxStamina: 120 }, 0);
    const { status, body } = await save({ maxStamina: 110 }, 1);
    expect(status).toBe(200);
    expect(body.settings.version).toBe(2);
  });
});
