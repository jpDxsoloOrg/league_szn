import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

const mockGetFantasyConfig = vi.fn();
const mockUpdateFantasyConfig = vi.fn();
const mockGetWrestlerCosts = vi.fn();
const mockInitializeWrestlerCosts = vi.fn();
const mockRecalculateWrestlerCosts = vi.fn();
const mockUpdateWrestlerCost = vi.fn();
const mockGetFantasyLeaderboard = vi.fn();
const mockScoreCompletedEvents = vi.fn();
const mockSubmitPicks = vi.fn();
const mockGetUserPicks = vi.fn();
const mockGetAllMyPicks = vi.fn();
const mockClearPicks = vi.fn();

vi.mock('../getFantasyConfig', () => ({ handler: (...args: unknown[]) => mockGetFantasyConfig(...args) }));
vi.mock('../updateFantasyConfig', () => ({ handler: (...args: unknown[]) => mockUpdateFantasyConfig(...args) }));
vi.mock('../getWrestlerCosts', () => ({ handler: (...args: unknown[]) => mockGetWrestlerCosts(...args) }));
vi.mock('../initializeWrestlerCosts', () => ({ handler: (...args: unknown[]) => mockInitializeWrestlerCosts(...args) }));
vi.mock('../recalculateWrestlerCosts', () => ({ handler: (...args: unknown[]) => mockRecalculateWrestlerCosts(...args) }));
vi.mock('../updateWrestlerCost', () => ({ handler: (...args: unknown[]) => mockUpdateWrestlerCost(...args) }));
vi.mock('../getFantasyLeaderboard', () => ({ handler: (...args: unknown[]) => mockGetFantasyLeaderboard(...args) }));
vi.mock('../scoreCompletedEvents', () => ({ handler: (...args: unknown[]) => mockScoreCompletedEvents(...args) }));
vi.mock('../submitPicks', () => ({ handler: (...args: unknown[]) => mockSubmitPicks(...args) }));
vi.mock('../getUserPicks', () => ({ handler: (...args: unknown[]) => mockGetUserPicks(...args) }));
vi.mock('../getAllMyPicks', () => ({ handler: (...args: unknown[]) => mockGetAllMyPicks(...args) }));
vi.mock('../clearPicks', () => ({ handler: (...args: unknown[]) => mockClearPicks(...args) }));

import { handler } from '../handler';

const ctx = {} as Context;
const noopCb = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/fantasy/config',
    pathParameters: null,
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '',
    ...overrides,
  };
}

describe('fantasy router handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const ok = { statusCode: 200, body: '{}' };
    mockGetFantasyConfig.mockResolvedValue(ok);
    mockUpdateFantasyConfig.mockResolvedValue(ok);
    mockGetWrestlerCosts.mockResolvedValue(ok);
    mockInitializeWrestlerCosts.mockResolvedValue(ok);
    mockRecalculateWrestlerCosts.mockResolvedValue(ok);
    mockUpdateWrestlerCost.mockResolvedValue(ok);
    mockGetFantasyLeaderboard.mockResolvedValue(ok);
    mockScoreCompletedEvents.mockResolvedValue(ok);
    mockSubmitPicks.mockResolvedValue(ok);
    mockGetUserPicks.mockResolvedValue(ok);
    mockGetAllMyPicks.mockResolvedValue(ok);
    mockClearPicks.mockResolvedValue(ok);
  });

  it('GET fantasy/config calls getFantasyConfig', async () => {
    const event = makeEvent({ httpMethod: 'GET', path: '/fantasy/config' });
    await handler(event, ctx, noopCb);
    expect(mockGetFantasyConfig).toHaveBeenCalledWith(event, ctx, noopCb);
  });

  it('PUT admin/fantasy/config calls updateFantasyConfig', async () => {
    const event = makeEvent({ httpMethod: 'PUT', path: '/admin/fantasy/config' });
    await handler(event, ctx, noopCb);
    expect(mockUpdateFantasyConfig).toHaveBeenCalledWith(event, ctx, noopCb);
  });

  it('GET fantasy/wrestlers/costs calls getWrestlerCosts', async () => {
    const event = makeEvent({ httpMethod: 'GET', path: '/fantasy/wrestlers/costs' });
    await handler(event, ctx, noopCb);
    expect(mockGetWrestlerCosts).toHaveBeenCalledWith(event, ctx, noopCb);
  });

  it('POST path containing initialize calls initializeWrestlerCosts', async () => {
    const event = makeEvent({ httpMethod: 'POST', path: '/admin/fantasy/wrestlers/costs/initialize' });
    await handler(event, ctx, noopCb);
    expect(mockInitializeWrestlerCosts).toHaveBeenCalledWith(event, ctx, noopCb);
  });

  it('POST path containing recalculate calls recalculateWrestlerCosts', async () => {
    const event = makeEvent({ httpMethod: 'POST', path: '/admin/fantasy/wrestlers/costs/recalculate' });
    await handler(event, ctx, noopCb);
    expect(mockRecalculateWrestlerCosts).toHaveBeenCalledWith(event, ctx, noopCb);
  });

  it('PUT path ending with /cost and playerId calls updateWrestlerCost', async () => {
    const event = makeEvent({
      httpMethod: 'PUT',
      path: '/admin/fantasy/wrestlers/p1/cost',
      pathParameters: { playerId: 'p1' },
    });
    await handler(event, ctx, noopCb);
    expect(mockUpdateWrestlerCost).toHaveBeenCalledWith(event, ctx, noopCb);
  });

  it('GET fantasy/leaderboard calls getFantasyLeaderboard', async () => {
    const event = makeEvent({ httpMethod: 'GET', path: '/fantasy/leaderboard' });
    await handler(event, ctx, noopCb);
    expect(mockGetFantasyLeaderboard).toHaveBeenCalledWith(event, ctx, noopCb);
  });

  it('POST fantasy/score calls scoreCompletedEvents', async () => {
    const event = makeEvent({ httpMethod: 'POST', path: '/fantasy/score' });
    await handler(event, ctx, noopCb);
    expect(mockScoreCompletedEvents).toHaveBeenCalledWith(event, ctx, noopCb);
  });

  it('GET fantasy/me/picks calls getAllMyPicks', async () => {
    const event = makeEvent({ httpMethod: 'GET', path: '/fantasy/me/picks' });
    await handler(event, ctx, noopCb);
    expect(mockGetAllMyPicks).toHaveBeenCalledWith(event, ctx, noopCb);
  });

  it('POST fantasy/picks with eventId calls submitPicks', async () => {
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/fantasy/picks/e1',
      pathParameters: { eventId: 'e1' },
    });
    await handler(event, ctx, noopCb);
    expect(mockSubmitPicks).toHaveBeenCalledWith(event, ctx, noopCb);
  });

  it('GET fantasy/picks with eventId calls getUserPicks', async () => {
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/fantasy/picks/e1',
      pathParameters: { eventId: 'e1' },
    });
    await handler(event, ctx, noopCb);
    expect(mockGetUserPicks).toHaveBeenCalledWith(event, ctx, noopCb);
  });

  it('DELETE fantasy/picks with eventId calls clearPicks', async () => {
    const event = makeEvent({
      httpMethod: 'DELETE',
      path: '/fantasy/picks/e1',
      pathParameters: { eventId: 'e1' },
    });
    await handler(event, ctx, noopCb);
    expect(mockClearPicks).toHaveBeenCalledWith(event, ctx, noopCb);
  });

  it('unknown route returns 405 Method Not Allowed', async () => {
    const event = makeEvent({ httpMethod: 'PATCH', path: '/fantasy/other' });
    const result = await handler(event, ctx, noopCb);
    expect(result).toBeDefined();
    expect(result!.statusCode).toBe(405);
  });
});
