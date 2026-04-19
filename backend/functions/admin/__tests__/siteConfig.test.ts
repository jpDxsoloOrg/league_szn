import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
} from '../../../lib/repositories';
// InMemoryUserRepository import removed — no longer needed
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';

import { handler as getSiteConfig } from '../getSiteConfig';
import { handler as updateSiteConfig } from '../updateSiteConfig';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

const DEFAULT_FEATURES = {
  fantasy: true,
  challenges: true,
  promos: true,
  contenders: true,
  statistics: true,
  stables: true,
};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

function withAuth(event: APIGatewayProxyEvent, groups: string, sub = 'user-sub-1'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: sub },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
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

// ─── getSiteConfig ──────────────────────────────────────────────────

describe('getSiteConfig', () => {
  it('returns default features when no config has been set', async () => {
    const result = await getSiteConfig(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.features).toEqual(DEFAULT_FEATURES);
  });

  it('returns features from existing config', async () => {
    await siteConfigRepo.updateFeatures({
      fantasy: false,
      challenges: true,
      promos: false,
      contenders: true,
      statistics: true,
      stables: true,
    });

    const result = await getSiteConfig(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.features).toEqual({
      fantasy: false,
      challenges: true,
      promos: false,
      contenders: true,
      statistics: true,
      stables: true,
    });
  });
});

// ─── updateSiteConfig ───────────────────────────────────────────────

describe('updateSiteConfig', () => {
  it('returns 403 when user is not Admin', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ features: { fantasy: false } }) }),
      'Wrestler',
    );

    const result = await updateSiteConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toContain('permission');
  });

  it('returns 403 when user is Moderator (not full Admin)', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ features: { fantasy: false } }) }),
      'Moderator',
    );

    const result = await updateSiteConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
  });

  it('returns 400 when request body is missing', async () => {
    const event = withAuth(makeEvent({ body: null }), 'Admin');

    const result = await updateSiteConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 when features object is missing from body', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ notFeatures: true }) }),
      'Admin',
    );

    const result = await updateSiteConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('features object is required');
  });

  it('returns 400 when features is not an object', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ features: 'invalid' }) }),
      'Admin',
    );

    const result = await updateSiteConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('features object is required');
  });

  it('returns 400 when an invalid feature key is provided', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ features: { invalidFeature: true } }) }),
      'Admin',
    );

    const result = await updateSiteConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Invalid feature key: invalidFeature');
    expect(JSON.parse(result!.body).message).toContain('Valid keys:');
  });

  it('returns 400 when a feature value is not a boolean', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ features: { fantasy: 'yes' } }) }),
      'Admin',
    );

    const result = await updateSiteConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Feature value for fantasy must be a boolean');
  });

  it('merges new features with existing config and returns updated features', async () => {
    await siteConfigRepo.updateFeatures({
      fantasy: true,
      challenges: true,
      promos: true,
      contenders: true,
      statistics: true,
      stables: true,
    });

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ features: { fantasy: false, promos: false } }) }),
      'Admin',
    );

    const result = await updateSiteConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.features).toEqual({
      fantasy: false,
      challenges: true,
      promos: false,
      contenders: true,
      statistics: true,
      stables: true,
    });
  });

  it('uses default features when no existing config and merges new values', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ features: { statistics: false } }) }),
      'Admin',
    );

    const result = await updateSiteConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.features).toEqual({
      fantasy: true,
      challenges: true,
      promos: true,
      contenders: true,
      statistics: false,
      stables: true,
    });
  });
});
