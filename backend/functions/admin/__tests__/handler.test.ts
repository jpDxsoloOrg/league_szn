import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

const mockGetSiteConfig = vi.fn();
const mockUpdateSiteConfig = vi.fn();
const mockClearAll = vi.fn();
const mockSeedData = vi.fn();

vi.mock('../getSiteConfig', () => ({ handler: (...args: unknown[]) => mockGetSiteConfig(...args) }));
vi.mock('../updateSiteConfig', () => ({ handler: (...args: unknown[]) => mockUpdateSiteConfig(...args) }));
vi.mock('../clearAll', () => ({ handler: (...args: unknown[]) => mockClearAll(...args) }));
vi.mock('../seedData', () => ({ handler: (...args: unknown[]) => mockSeedData(...args) }));

import { handler } from '../handler';

const ctx = {} as Context;
const noopCb = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/site-config',
    pathParameters: null,
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '/site-config',
    ...overrides,
  };
}

describe('admin router handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSiteConfig.mockResolvedValue({ statusCode: 200, body: '{}' });
    mockUpdateSiteConfig.mockResolvedValue({ statusCode: 200, body: '{}' });
    mockClearAll.mockResolvedValue({ statusCode: 200, body: '{}' });
    mockSeedData.mockResolvedValue({ statusCode: 200, body: '{}' });
  });

  it('GET path containing site-config calls getSiteConfig', async () => {
    const event = makeEvent({ httpMethod: 'GET', resource: '/site-config' });
    await handler(event, ctx, noopCb);
    expect(mockGetSiteConfig).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockUpdateSiteConfig).not.toHaveBeenCalled();
    expect(mockClearAll).not.toHaveBeenCalled();
    expect(mockSeedData).not.toHaveBeenCalled();
  });

  it('PUT path containing site-config calls updateSiteConfig', async () => {
    const event = makeEvent({ httpMethod: 'PUT', resource: '/admin/site-config' });
    await handler(event, ctx, noopCb);
    expect(mockUpdateSiteConfig).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockGetSiteConfig).not.toHaveBeenCalled();
  });

  it('DELETE path containing clear-all calls clearAll', async () => {
    const event = makeEvent({ httpMethod: 'DELETE', resource: '/admin/clear-all' });
    await handler(event, ctx, noopCb);
    expect(mockClearAll).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockSeedData).not.toHaveBeenCalled();
  });

  it('POST path containing seed-data calls seedData', async () => {
    const event = makeEvent({ httpMethod: 'POST', resource: '/admin/seed-data' });
    await handler(event, ctx, noopCb);
    expect(mockSeedData).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockClearAll).not.toHaveBeenCalled();
  });

  it('unknown route returns 405 Method Not Allowed', async () => {
    const event = makeEvent({ httpMethod: 'PATCH', resource: '/admin/other' });
    const result = await handler(event, ctx, noopCb);
    expect(result).toBeDefined();
    expect(result!.statusCode).toBe(405);
    expect(mockGetSiteConfig).not.toHaveBeenCalled();
    expect(mockUpdateSiteConfig).not.toHaveBeenCalled();
    expect(mockClearAll).not.toHaveBeenCalled();
    expect(mockSeedData).not.toHaveBeenCalled();
  });
});
