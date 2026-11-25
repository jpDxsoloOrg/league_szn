import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context, Callback } from 'aws-lambda';
import { setRepositoriesForTesting, resetRepositoriesForTesting } from '../../../lib/repositories';
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import { DEFAULT_ECONOMY_SETTINGS } from '../../../lib/policies/economyDefaults';
import { handler as getEconomyConfig } from '../getEconomyConfig';
import { handler as updateEconomyConfig } from '../updateEconomyConfig';
import { handler as getEconomyCatalog } from '../getEconomyCatalog';

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(groups: string | null, body?: unknown): APIGatewayProxyEvent {
  const authorizer = groups === null
    ? {}
    : { groups, username: 'gm-jane', email: 'jane@test.com', principalId: 'sub-1' };
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
    requestContext: { authorizer } as unknown as APIGatewayProxyEvent['requestContext'],
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

describe('GET /admin/economy-config', () => {
  it('returns the defaults to a Moderator before anything is saved', async () => {
    const { status, body } = parse(await getEconomyConfig(makeEvent('Moderator'), ctx, cb));
    expect(status).toBe(200);
    expect(body.settings).toEqual(DEFAULT_ECONOMY_SETTINGS);
  });

  it('refuses a Wrestler', async () => {
    expect(parse(await getEconomyConfig(makeEvent('Wrestler'), ctx, cb)).status).toBe(403);
  });
});

describe('PUT /admin/economy-config', () => {
  it('merges a partial update, bumps the version and records who saved it', async () => {
    const { status, body } = parse(await updateEconomyConfig(
      makeEvent('Admin', { settings: { noShowFine: 400, shop: { rehab: { price: 750 } } } }),
      ctx,
      cb,
    ));

    expect(status).toBe(200);
    expect(body.settings).toMatchObject({ noShowFine: 400, version: 1, updatedBy: 'gm-jane' });
    expect(body.settings.shop.rehab).toEqual({ enabled: true, price: 750, weeksOff: 1 });
    expect(body.settings.shop.injuryShield).toEqual(DEFAULT_ECONOMY_SETTINGS.shop.injuryShield);
    expect(typeof body.settings.updatedAt).toBe('string');
    expect((await siteConfigRepo.getEconomySettings()).noShowFine).toBe(400);
  });

  it('bumps the version again on the next save and keeps the history', async () => {
    await updateEconomyConfig(makeEvent('Admin', { settings: { noShowFine: 1 } }), ctx, cb);
    const { body } = parse(await updateEconomyConfig(makeEvent('Admin', { settings: { noShowFine: 2 } }), ctx, cb));

    expect(body.settings.version).toBe(2);
    const versions = await siteConfigRepo.listEconomySettingsVersions();
    expect(versions.map((version) => [version.version, version.noShowFine])).toEqual([[2, 2], [1, 1]]);
  });

  it('refuses a Moderator', async () => {
    const result = parse(await updateEconomyConfig(makeEvent('Moderator', { settings: { noShowFine: 1 } }), ctx, cb));
    expect(result.status).toBe(403);
    expect((await siteConfigRepo.getEconomySettings()).version).toBe(0);
  });

  it('rejects invalid settings without saving', async () => {
    const result = parse(await updateEconomyConfig(
      makeEvent('Admin', { settings: { shop: { injuryShield: { chanceReduction: 2 } } } }),
      ctx,
      cb,
    ));
    expect(result.status).toBe(400);
    expect(result.body.message).toContain('chanceReduction');
    expect((await siteConfigRepo.getEconomySettings()).version).toBe(0);
  });

  it('rejects a missing settings object and a bad expectedVersion', async () => {
    expect(parse(await updateEconomyConfig(makeEvent('Admin', {}), ctx, cb)).status).toBe(400);
    expect(parse(await updateEconomyConfig(makeEvent('Admin', { settings: [] }), ctx, cb)).status).toBe(400);
    const badVersion = await updateEconomyConfig(makeEvent('Admin', { settings: {}, expectedVersion: 'one' }), ctx, cb);
    expect(parse(badVersion).status).toBe(400);
  });

  it('returns 409 when expectedVersion is stale', async () => {
    await updateEconomyConfig(makeEvent('Admin', { settings: { noShowFine: 1 }, expectedVersion: 0 }), ctx, cb);
    const stale = parse(await updateEconomyConfig(
      makeEvent('Admin', { settings: { noShowFine: 2 }, expectedVersion: 0 }),
      ctx,
      cb,
    ));
    expect(stale.status).toBe(409);
    expect((await siteConfigRepo.getEconomySettings()).noShowFine).toBe(1);
  });
});

describe('GET /economy/catalog', () => {
  it('lists the enabled shop items with prices, without contract or fine figures', async () => {
    await updateEconomyConfig(
      makeEvent('Admin', { settings: { currencyName: 'Bucks', shop: { gmInterference: { enabled: false } } } }),
      ctx,
      cb,
    );

    const { status, body } = parse(await getEconomyCatalog(makeEvent(null), ctx, cb));

    expect(status).toBe(200);
    expect(body.currencyName).toBe('Bucks');
    expect(body.items.map((item: { key: string }) => item.key)).toEqual([
      'injuryShield',
      'rehab',
      'staminaTopUp',
      'simInterference',
    ]);
    expect(body.items[0]).toEqual({ key: 'injuryShield', ...DEFAULT_ECONOMY_SETTINGS.shop.injuryShield });
    expect(body).not.toHaveProperty('contractDefaults');
    expect(body).not.toHaveProperty('finePresets');
    expect(body).not.toHaveProperty('noShowFine');
  });
});
