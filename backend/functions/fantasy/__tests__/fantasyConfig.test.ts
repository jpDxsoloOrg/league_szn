import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Mocks ----------------------------------------------------------------

const mockFantasyRepo = {
  getConfig: vi.fn(),
  upsertConfig: vi.fn(),
  findPick: vi.fn(),
  listPicksByEvent: vi.fn(),
  listPicksByUser: vi.fn(),
  listAllPicks: vi.fn(),
  savePick: vi.fn(),
  updatePickScoring: vi.fn(),
  deletePick: vi.fn(),
  findCost: vi.fn(),
  listAllCosts: vi.fn(),
  upsertCost: vi.fn(),
  initializeCost: vi.fn(),
};

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    user: { fantasy: mockFantasyRepo },
  }),
}));

import { handler as getFantasyConfig } from '../getFantasyConfig';
import { handler as updateFantasyConfig } from '../updateFantasyConfig';

// ---- Helpers ---------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {},
    httpMethod: 'GET', isBase64Encoded: false, path: '/',
    pathParameters: null, queryStringParameters: null,
    multiValueQueryStringParameters: null, stageVariables: null,
    resource: '', requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

function withAuth(event: APIGatewayProxyEvent, groups = 'Admin', sub = 'admin-1'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'admin', email: 'admin@test.com', principalId: sub },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

// ---- getFantasyConfig ------------------------------------------------------

describe('getFantasyConfig', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns stored config when it exists', async () => {
    const storedConfig = { configKey: 'GLOBAL', defaultBudget: 750, baseWinPoints: 15 };
    mockFantasyRepo.getConfig.mockResolvedValueOnce(storedConfig);

    const result = await getFantasyConfig(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual(storedConfig);
  });

  it('returns DEFAULT_CONFIG when no config exists', async () => {
    mockFantasyRepo.getConfig.mockResolvedValueOnce(null);

    const result = await getFantasyConfig(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.configKey).toBe('GLOBAL');
    expect(body.defaultBudget).toBe(500);
    expect(body.defaultPicksPerDivision).toBe(2);
    expect(body.baseWinPoints).toBe(10);
    expect(body.championshipBonus).toBe(5);
    expect(body.titleWinBonus).toBe(10);
    expect(body.titleDefenseBonus).toBe(5);
    expect(body.costFluctuationEnabled).toBe(true);
    expect(body.costChangePerWin).toBe(10);
    expect(body.costChangePerLoss).toBe(5);
    expect(body.costResetStrategy).toBe('reset');
    expect(body.underdogMultiplier).toBe(1.5);
    expect(body.perfectPickBonus).toBe(50);
    expect(body.streakBonusThreshold).toBe(5);
    expect(body.streakBonusPoints).toBe(25);
  });

  it('returns 500 on repository error', async () => {
    mockFantasyRepo.getConfig.mockRejectedValueOnce(new Error('DynamoDB failure'));

    const result = await getFantasyConfig(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
  });
});

// ---- updateFantasyConfig ---------------------------------------------------

describe('updateFantasyConfig', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when user lacks Admin role', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ defaultBudget: 600 }) }),
      'Fantasy',
    );
    const result = await updateFantasyConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
  });

  it('returns 400 when body is missing', async () => {
    const event = withAuth(makeEvent({ body: null }));
    const result = await updateFantasyConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    const event = withAuth(makeEvent({ body: 'not-json' }));
    const result = await updateFantasyConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
  });

  it('merges updates into existing config', async () => {
    const merged = { configKey: 'GLOBAL', defaultBudget: 750, baseWinPoints: 10 };
    mockFantasyRepo.upsertConfig.mockResolvedValueOnce(merged);

    const event = withAuth(makeEvent({
      body: JSON.stringify({ defaultBudget: 750 }),
    }));
    const result = await updateFantasyConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.defaultBudget).toBe(750);
    expect(body.baseWinPoints).toBe(10); // preserved
    expect(body.configKey).toBe('GLOBAL'); // always enforced
  });

  it('uses DEFAULT_CONFIG when no existing config', async () => {
    const merged = { configKey: 'GLOBAL', defaultBudget: 500, baseWinPoints: 20 };
    mockFantasyRepo.upsertConfig.mockResolvedValueOnce(merged);

    const event = withAuth(makeEvent({
      body: JSON.stringify({ baseWinPoints: 20 }),
    }));
    const result = await updateFantasyConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.baseWinPoints).toBe(20);
    expect(body.defaultBudget).toBe(500); // from defaults
    expect(body.configKey).toBe('GLOBAL');
  });

  it('always enforces configKey as GLOBAL even if body tries to change it', async () => {
    const merged = { configKey: 'GLOBAL' };
    mockFantasyRepo.upsertConfig.mockResolvedValueOnce(merged);

    const event = withAuth(makeEvent({
      body: JSON.stringify({ configKey: 'HACKED' }),
    }));
    const result = await updateFantasyConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).configKey).toBe('GLOBAL');
  });

  it('returns 500 on repository error', async () => {
    mockFantasyRepo.upsertConfig.mockRejectedValueOnce(new Error('fail'));

    const event = withAuth(makeEvent({ body: JSON.stringify({ x: 1 }) }));
    const result = await updateFantasyConfig(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
  });
});
