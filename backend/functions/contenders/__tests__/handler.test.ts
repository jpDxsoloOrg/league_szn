import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

const mockGetContenders = vi.fn();
const mockCalculateRankings = vi.fn();
const mockSetOverride = vi.fn();
const mockRemoveOverride = vi.fn();
const mockGetOverrides = vi.fn();

vi.mock('../getContenders', () => ({ handler: (...args: unknown[]) => mockGetContenders(...args) }));
vi.mock('../calculateRankings', () => ({ handler: (...args: unknown[]) => mockCalculateRankings(...args) }));
vi.mock('../setOverride', () => ({ handler: (...args: unknown[]) => mockSetOverride(...args) }));
vi.mock('../removeOverride', () => ({ handler: (...args: unknown[]) => mockRemoveOverride(...args) }));
vi.mock('../getOverrides', () => ({ handler: (...args: unknown[]) => mockGetOverrides(...args) }));

vi.mock('../../../lib/authenticate', () => ({
  authenticate: async () => ({ ok: false }),
}));

import { handler } from '../handler';

const ctx = {} as Context;
const noopCb = () => {};

const contextFor = (groups: string) =>
  ({ authorizer: { principalId: 'sub-1', groups } }) as unknown as APIGatewayProxyEvent['requestContext'];

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/championships/ch1/contenders',
    pathParameters: null,
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '/championships/{championshipId}/contenders',
    ...overrides,
  };
}

const adminRoutes = [
  { name: 'recalculate', httpMethod: 'POST', resource: '/admin/contenders/recalculate', mock: mockCalculateRankings },
  { name: 'set override', httpMethod: 'POST', resource: '/admin/contenders/overrides', mock: mockSetOverride },
  { name: 'list overrides', httpMethod: 'GET', resource: '/admin/contenders/overrides', mock: mockGetOverrides },
  {
    name: 'remove override',
    httpMethod: 'DELETE',
    resource: '/admin/contenders/overrides/{championshipId}/{playerId}',
    mock: mockRemoveOverride,
  },
];

describe('contenders router handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const mock of [mockGetContenders, mockCalculateRankings, mockSetOverride, mockRemoveOverride, mockGetOverrides]) {
      mock.mockResolvedValue({ statusCode: 200, body: '{}' });
    }
  });

  it('GET contenders is public', async () => {
    const event = makeEvent({ pathParameters: { championshipId: 'ch1' } });
    const result = await handler(event, ctx, noopCb);
    expect(result!.statusCode).toBe(200);
    expect(mockGetContenders).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockCalculateRankings).not.toHaveBeenCalled();
  });

  it.each(adminRoutes)('$name reaches its handler for staff', async ({ httpMethod, resource, mock }) => {
    for (const groups of ['Admin', 'Moderator']) {
      const result = await handler(makeEvent({ httpMethod, resource, requestContext: contextFor(groups) }), ctx, noopCb);
      expect(result!.statusCode).toBe(200);
    }
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it.each(adminRoutes)('$name returns 403 for a Wrestler', async ({ httpMethod, resource, mock }) => {
    const result = await handler(makeEvent({ httpMethod, resource, requestContext: contextFor('Wrestler') }), ctx, noopCb);
    expect(result!.statusCode).toBe(403);
    expect(mock).not.toHaveBeenCalled();
  });

  it.each(adminRoutes)('$name returns 401 with no verified caller', async ({ httpMethod, resource, mock }) => {
    const result = await handler(makeEvent({ httpMethod, resource }), ctx, noopCb);
    expect(result!.statusCode).toBe(401);
    expect(mock).not.toHaveBeenCalled();
  });

  it('PATCH returns 405 Method Not Allowed', async () => {
    const event = makeEvent({ httpMethod: 'PATCH' });
    const result = await handler(event, ctx, noopCb);
    expect(result).toBeDefined();
    expect(result!.statusCode).toBe(405);
    expect(mockGetContenders).not.toHaveBeenCalled();
    expect(mockCalculateRankings).not.toHaveBeenCalled();
  });

  describe('direct Lambda invocation', () => {
    it.each([
      ['recordResult', { source: 'recordResult' }],
      ['an override change', { source: 'recordResult', championshipId: 'ch1' }],
      ['deleteMatch', { source: 'deleteMatch' }],
      ['a caller with no source', {}],
    ])('recalculates for %s with no role check', async (_name, payload) => {
      const event = payload as unknown as APIGatewayProxyEvent;
      await handler(event, ctx, noopCb);
      expect(mockCalculateRankings).toHaveBeenCalledTimes(1);
      expect(mockCalculateRankings).toHaveBeenCalledWith(event, ctx, noopCb);
    });

    it('does not treat a source field on an API request as a direct invocation', async () => {
      const event = {
        ...makeEvent({ httpMethod: 'POST', resource: '/admin/contenders/recalculate' }),
        source: 'recordResult',
      };
      const result = await handler(event, ctx, noopCb);
      expect(result!.statusCode).toBe(401);
      expect(mockCalculateRankings).not.toHaveBeenCalled();
    });
  });
});
