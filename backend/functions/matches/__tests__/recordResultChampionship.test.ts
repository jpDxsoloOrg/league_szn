import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Mocks ----------------------------------------------------------------

const { mockGet, mockScan, mockQuery, mockUpdate, mockTransactWrite } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockScan: vi.fn(),
  mockQuery: vi.fn(),
  mockUpdate: vi.fn(),
  mockTransactWrite: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet, put: vi.fn(), scan: mockScan, query: mockQuery,
    update: mockUpdate, delete: vi.fn(), scanAll: vi.fn(), queryAll: vi.fn(),
    transactWrite: mockTransactWrite,
  },
  TableNames: {
    MATCHES: 'Matches', PLAYERS: 'Players', CHAMPIONSHIPS: 'Championships',
    CHAMPIONSHIP_HISTORY: 'ChampionshipHistory', TOURNAMENTS: 'Tournaments',
    SEASONS: 'Seasons', SEASON_STANDINGS: 'SeasonStandings',
    EVENTS: 'Events', CONTENDER_RANKINGS: 'ContenderRankings',
  },
}));

vi.mock('../../../lib/rankingCalculator', () => ({
  calculateRankingsForChampionship: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../fantasy/recalculateWrestlerCosts', () => ({
  recalculateCosts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../fantasy/calculateFantasyPoints', () => ({
  calculateFantasyPoints: vi.fn().mockResolvedValue(undefined),
}));

import { handler as recordResult } from '../recordResult';

// ---- Helpers ---------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};
const champMatch = {
  matchId: 'm1', date: '2024-06-01', status: 'pending',
  participants: ['p1', 'p2'], isChampionship: true, championshipId: 'c1',
};

function ev(body: object): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body), headers: {}, multiValueHeaders: {},
    httpMethod: 'POST', isBase64Encoded: false, path: '/',
    pathParameters: { matchId: 'm1' }, queryStringParameters: null,
    multiValueQueryStringParameters: null, stageVariables: null,
    resource: '', requestContext: { authorizer: {} } as any,
  };
}

function stubChamp(champData: Record<string, unknown>, reign?: Record<string, unknown>) {
  mockQuery.mockImplementation(async (params: any) => {
    if (params.TableName === 'Matches') return { Items: [champMatch] };
    if (params.TableName === 'ChampionshipHistory') return { Items: reign ? [reign] : [] };
    return { Items: [] };
  });
  mockTransactWrite.mockResolvedValue({});
  mockGet.mockResolvedValue({ Item: champData });
  mockUpdate.mockResolvedValue({});
  mockScan.mockResolvedValue({ Items: [] });
}

// ---- Championship Transaction Tests ----------------------------------------

describe('recordResult — championship title change', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates champion, closes old reign, creates new reign on title change', async () => {
    stubChamp(
      { championshipId: 'c1', currentChampion: 'p2' },
      { championshipId: 'c1', wonDate: '2024-01-01T00:00:00Z', champion: 'p2' },
    );
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    const champTx = mockTransactWrite.mock.calls[1][0].TransactItems;
    expect(champTx).toHaveLength(3);
    // Update currentChampion
    expect(champTx[0].Update.UpdateExpression).toContain('currentChampion');
    expect(champTx[0].Update.ExpressionAttributeValues[':champion']).toBe('p1');
    // Close old reign
    expect(champTx[1].Update.UpdateExpression).toContain('lostDate');
    expect(champTx[1].Update.UpdateExpression).toContain('daysHeld');
    // New reign
    expect(champTx[2].Put.Item.champion).toBe('p1');
    expect(champTx[2].Put.Item.defenses).toBe(0);
  });

  it('sets isTitleDefense to false on title change', async () => {
    stubChamp(
      { championshipId: 'c1', currentChampion: 'p2' },
      { championshipId: 'c1', wonDate: '2024-01-01T00:00:00Z', champion: 'p2' },
    );
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        ExpressionAttributeValues: { ':itd': false },
      }),
    );
  });

  it('creates new reign without closing old when no previous champion', async () => {
    stubChamp({ championshipId: 'c1', currentChampion: undefined });
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    const champTx = mockTransactWrite.mock.calls[1][0].TransactItems;
    // Update champion + new reign only (no close old reign)
    expect(champTx).toHaveLength(2);
    expect(champTx[0].Update.UpdateExpression).toContain('currentChampion');
    expect(champTx[1].Put.Item.champion).toBe('p1');
  });
});

describe('recordResult — championship title defense', () => {
  beforeEach(() => vi.clearAllMocks());

  it('increments defenses on current reign for title defense', async () => {
    stubChamp(
      { championshipId: 'c1', currentChampion: 'p1' },
      { championshipId: 'c1', wonDate: '2024-01-01T00:00:00Z', champion: 'p1' },
    );
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        ExpressionAttributeValues: { ':itd': true },
      }),
    );
    const champTx = mockTransactWrite.mock.calls[1][0].TransactItems;
    expect(champTx).toHaveLength(1);
    expect(champTx[0].Update.UpdateExpression).toContain('defenses');
  });

  it('detects tag team title defense with reversed winner order', async () => {
    stubChamp(
      { championshipId: 'c1', currentChampion: ['p1', 'p2'] },
      { championshipId: 'c1', wonDate: '2024-01-01T00:00:00Z', champion: ['p1', 'p2'] },
    );
    // Winners in reversed order from currentChampion
    await recordResult(ev({ winners: ['p2', 'p1'], losers: ['p3', 'p4'] }), ctx, cb);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        ExpressionAttributeValues: { ':itd': true },
      }),
    );
  });

  it('tag team title change when different team wins', async () => {
    stubChamp(
      { championshipId: 'c1', currentChampion: ['p1', 'p2'] },
      { championshipId: 'c1', wonDate: '2024-01-01T00:00:00Z', champion: ['p1', 'p2'] },
    );
    await recordResult(ev({ winners: ['p3', 'p4'], losers: ['p1', 'p2'] }), ctx, cb);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        ExpressionAttributeValues: { ':itd': false },
      }),
    );
    const champTx = mockTransactWrite.mock.calls[1][0].TransactItems;
    // Update champion + close old + new reign
    expect(champTx).toHaveLength(3);
    expect(champTx[0].Update.ExpressionAttributeValues[':champion']).toEqual(['p3', 'p4']);
  });
});
