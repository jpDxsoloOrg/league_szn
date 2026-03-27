import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockGet, mockPut } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: { get: mockGet, put: mockPut },
  TableNames: {
    SITE_CONFIG: 'SiteConfig',
    STABLES: 'Stables',
    TAG_TEAMS: 'TagTeams',
    STABLE_INVITATIONS: 'StableInvitations',
  },
}));

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
    requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

function withAuth(event: APIGatewayProxyEvent, groups: string, sub = 'user-sub-1'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: sub },
    } as any,
  };
}

// ─── getSiteConfig ──────────────────────────────────────────────────

describe('getSiteConfig', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns features from existing config item', async () => {
    const storedFeatures = {
      fantasy: false,
      challenges: true,
      promos: false,
      contenders: true,
      statistics: true,
      stables: true,
    };
    mockGet.mockResolvedValue({
      Item: { configKey: 'features', features: storedFeatures },
    });

    const result = await getSiteConfig(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.features).toEqual(storedFeatures);
    expect(mockGet).toHaveBeenCalledWith({
      TableName: 'SiteConfig',
      Key: { configKey: 'features' },
    });
  });

  it('returns default features when no config item exists', async () => {
    mockGet.mockResolvedValue({ Item: undefined });

    const result = await getSiteConfig(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.features).toEqual(DEFAULT_FEATURES);
  });

  it('returns default features when config item has no features field', async () => {
    mockGet.mockResolvedValue({
      Item: { configKey: 'features', features: null },
    });

    const result = await getSiteConfig(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.features).toEqual(DEFAULT_FEATURES);
  });

  it('returns 500 when DynamoDB throws an error', async () => {
    mockGet.mockRejectedValue(new Error('DynamoDB connection error'));

    const result = await getSiteConfig(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to get site configuration');
  });
});

// ─── updateSiteConfig ───────────────────────────────────────────────

describe('updateSiteConfig', () => {
  beforeEach(() => vi.clearAllMocks());

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
    const existingFeatures = {
      fantasy: true,
      challenges: true,
      promos: true,
      contenders: true,
      statistics: true,
      stables: true,
    };
    mockGet.mockResolvedValue({
      Item: { configKey: 'features', features: existingFeatures },
    });
    mockPut.mockResolvedValue({});

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
    expect(mockPut).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'SiteConfig',
        Item: expect.objectContaining({
          configKey: 'features',
          features: {
            fantasy: false,
            challenges: true,
            promos: false,
            contenders: true,
            statistics: true,
            stables: true,
          },
        }),
      }),
    );
  });

  it('uses default features when no existing config and merges new values', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    mockPut.mockResolvedValue({});

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

  it('returns 500 when DynamoDB throws an error', async () => {
    mockGet.mockRejectedValue(new Error('DynamoDB error'));

    const event = withAuth(
      makeEvent({ body: JSON.stringify({ features: { fantasy: true } }) }),
      'Admin',
    );

    const result = await updateSiteConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to update site configuration');
  });
});
