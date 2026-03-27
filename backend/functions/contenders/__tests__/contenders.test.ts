import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockGet, mockPut, mockDelete, mockScanAll, mockQueryAll, mockQuery } = vi.hoisted(() => ({
  mockGet: vi.fn(), mockPut: vi.fn(), mockDelete: vi.fn(),
  mockScanAll: vi.fn(), mockQueryAll: vi.fn(), mockQuery: vi.fn(),
}));

const { mockCalcRankings } = vi.hoisted(() => ({ mockCalcRankings: vi.fn() }));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet, put: mockPut, scan: vi.fn(), query: mockQuery,
    update: vi.fn(), delete: mockDelete, scanAll: mockScanAll, queryAll: mockQueryAll,
  },
  TableNames: {
    PLAYERS: 'Players', MATCHES: 'Matches', CHAMPIONSHIPS: 'Championships',
    CONTENDER_RANKINGS: 'ContenderRankings', RANKING_HISTORY: 'RankingHistory',
    CONTENDER_OVERRIDES: 'ContenderOverrides',
    STABLES: 'Stables', TAG_TEAMS: 'TagTeams', STABLE_INVITATIONS: 'StableInvitations',
  },
}));

vi.mock('../../../lib/rankingCalculator', () => ({
  calculateRankingsForChampionship: mockCalcRankings,
}));

vi.mock('../../../lib/overrideApplicator', () => ({
  applyOverrides: (rankings: unknown[]) => rankings.map((r: unknown, i: number) => ({
    ...(r as Record<string, unknown>),
    rank: i + 1,
    isOverridden: false,
    overrideType: null,
    organicRank: null,
  })),
}));

import { handler as calculateRankings } from '../calculateRankings';
import { handler as getContenders } from '../getContenders';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'GET',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: {} } as any, ...overrides,
  };
}

/** Shorthand for a RankingResult-shaped object returned by the calculator mock. */
function rankResult(playerId: string, rank: number, score = 80) {
  return {
    playerId, rank, rankingScore: score, winPercentage: 70,
    currentStreak: 2, qualityScore: 60, recencyScore: 65,
    matchesInPeriod: 5, winsInPeriod: 4,
  };
}

/** Shorthand for a ContenderRanking row stored in DynamoDB. */
function rankRow(cid: string, pid: string, rank: number, prev: number | null = null) {
  return {
    championshipId: cid, playerId: pid, rank, rankingScore: 80,
    winPercentage: 70, currentStreak: 2, matchesInPeriod: 5,
    winsInPeriod: 4, previousRank: prev, calculatedAt: '2025-01-15T00:00:00Z',
  };
}

function champ(id: string, name: string, extra: Record<string, unknown> = {}) {
  return { championshipId: id, name, type: 'singles', isActive: true, ...extra };
}

function player(id: string, name: string, wrestler: string, img?: string) {
  return { playerId: id, name, currentWrestler: wrestler, ...(img ? { imageUrl: img } : {}) };
}

// ─── calculateRankings ──────────────────────────────────────────────

describe('calculateRankings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ Items: [] });
  });

  it('calculates rankings via rankingCalculator and writes results', async () => {
    mockScanAll.mockResolvedValue([champ('c1', 'World Title')]);
    mockQueryAll.mockResolvedValue([]);
    mockCalcRankings.mockResolvedValue([rankResult('p1', 1)]);
    mockPut.mockResolvedValue({});

    const result = await calculateRankings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.championshipsProcessed).toBe(1);
    expect(body.totalRankings).toBe(1);
    expect(mockCalcRankings).toHaveBeenCalledWith(
      expect.objectContaining({ championshipId: 'c1', championshipType: 'singles' }),
    );
    expect(mockPut).toHaveBeenCalledTimes(2); // ranking + history
  });

  it('preserves previousRank, peakRank, and weeksAtTop from existing rankings', async () => {
    mockScanAll.mockResolvedValue([champ('c1', 'IC Title')]);
    mockQueryAll.mockResolvedValue([
      { championshipId: 'c1', playerId: 'p1', rank: 3, peakRank: 2, weeksAtTop: 1 },
    ]);
    mockDelete.mockResolvedValue({});
    mockCalcRankings.mockResolvedValue([rankResult('p1', 1, 90)]);
    mockPut.mockResolvedValue({});

    await calculateRankings(makeEvent(), ctx, cb);

    const crPut = mockPut.mock.calls.find((c: any) => c[0].TableName === 'ContenderRankings');
    expect(crPut).toBeDefined();
    const item = crPut![0].Item;
    expect(item.previousRank).toBe(3);
    expect(item.peakRank).toBe(1);       // min(oldPeak=2, newRank=1)
    expect(item.weeksAtTop).toBe(2);     // rank===1 so incremented from 1 to 2
  });

  it('deletes old rankings before writing new ones', async () => {
    mockScanAll.mockResolvedValue([champ('c1', 'Tag Title', { type: 'tag' })]);
    mockQueryAll.mockResolvedValue([
      { championshipId: 'c1', playerId: 'old-1', rank: 1 },
      { championshipId: 'c1', playerId: 'old-2', rank: 2 },
    ]);
    mockDelete.mockResolvedValue({});
    mockCalcRankings.mockResolvedValue([]);

    await calculateRankings(makeEvent(), ctx, cb);

    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(mockDelete).toHaveBeenCalledWith(expect.objectContaining({
      TableName: 'ContenderRankings', Key: { championshipId: 'c1', playerId: 'old-1' },
    }));
    expect(mockDelete).toHaveBeenCalledWith(expect.objectContaining({
      TableName: 'ContenderRankings', Key: { championshipId: 'c1', playerId: 'old-2' },
    }));
  });

  it('writes ranking history entries with weekKey in YYYY-WW format', async () => {
    mockScanAll.mockResolvedValue([champ('c1', 'World')]);
    mockQueryAll.mockResolvedValue([]);
    mockCalcRankings.mockResolvedValue([rankResult('p1', 1)]);
    mockPut.mockResolvedValue({});

    await calculateRankings(makeEvent(), ctx, cb);

    const histPut = mockPut.mock.calls.find((c: any) => c[0].TableName === 'RankingHistory');
    expect(histPut).toBeDefined();
    const item = histPut![0].Item;
    expect(item.playerId).toBe('p1');
    expect(item.championshipId).toBe('c1');
    expect(item.weekKey).toMatch(/^c1#\d{4}-\d{2}$/);
    expect(item.movement).toBe(0); // no previous rank
  });

  it('filters to a single championship when championshipId is in body', async () => {
    mockGet.mockResolvedValue({ Item: champ('c-x', 'US Title') });
    mockQueryAll.mockResolvedValue([]);
    mockCalcRankings.mockResolvedValue([]);

    const event = makeEvent({ body: JSON.stringify({ championshipId: 'c-x' }) });
    const result = await calculateRankings(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockGet).toHaveBeenCalledWith(expect.objectContaining({
      TableName: 'Championships', Key: { championshipId: 'c-x' },
    }));
    expect(mockScanAll).not.toHaveBeenCalled();
  });

  it('returns success with zero counts when no championships found', async () => {
    mockScanAll.mockResolvedValue([]);

    const result = await calculateRankings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.championshipsProcessed).toBe(0);
    expect(body.totalRankings).toBe(0);
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockScanAll.mockRejectedValue(new Error('DB down'));

    const result = await calculateRankings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to calculate rankings');
  });
});

// ─── getContenders ──────────────────────────────────────────────────

describe('getContenders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns contenders for a championship via RankIndex GSI', async () => {
    mockGet.mockResolvedValueOnce({ Item: champ('c1', 'World Title', { divisionId: 'raw' }) });
    mockQueryAll.mockResolvedValue([rankRow('c1', 'p1', 1, 2)]);
    mockGet.mockResolvedValueOnce({ Item: player('p1', 'John Cena', 'Cena', 'cena.jpg') });

    const result = await getContenders(makeEvent({ pathParameters: { championshipId: 'c1' } }), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.championshipId).toBe('c1');
    expect(body.championshipName).toBe('World Title');
    expect(body.divisionId).toBe('raw');
    expect(body.contenders).toHaveLength(1);
    expect(body.contenders[0].playerName).toBe('John Cena');
    expect(body.calculatedAt).toBe('2025-01-15T00:00:00Z');
  });

  it('filters out current champion and re-ranks remaining contenders', async () => {
    mockGet.mockResolvedValueOnce({ Item: champ('c1', 'World', { currentChampion: 'champ' }) });
    mockQueryAll.mockResolvedValue([
      rankRow('c1', 'champ', 1, 1), rankRow('c1', 'p2', 2, 3), rankRow('c1', 'p3', 3, null),
    ]);
    mockGet.mockResolvedValueOnce({ Item: player('champ', 'The Champ', 'Roman', 'roman.jpg') });
    mockGet.mockResolvedValueOnce({ Item: player('p2', 'Two', 'Seth') });
    mockGet.mockResolvedValueOnce({ Item: player('p3', 'Three', 'Drew') });

    const result = await getContenders(makeEvent({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    const body = JSON.parse(result!.body);

    expect(body.contenders).toHaveLength(2);
    expect(body.contenders.find((c: any) => c.playerId === 'champ')).toBeUndefined();
    expect(body.contenders[0].rank).toBe(1);
    expect(body.contenders[0].playerId).toBe('p2');
    expect(body.contenders[1].rank).toBe(2);
    expect(body.currentChampion).toMatchObject({
      playerId: 'champ', playerName: 'The Champ', wrestlerName: 'Roman',
    });
  });

  it('enriches contenders with player data and falls back to Unknown', async () => {
    mockGet.mockResolvedValueOnce({ Item: champ('c1', 'IC Title') });
    mockQueryAll.mockResolvedValue([rankRow('c1', 'p1', 1, 1), rankRow('c1', 'p-gone', 2, null)]);
    mockGet.mockResolvedValueOnce({ Item: player('p1', 'Known', 'AJ', 'aj.jpg') });
    mockGet.mockResolvedValueOnce({ Item: undefined }); // player not found

    const result = await getContenders(makeEvent({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    const body = JSON.parse(result!.body);

    expect(body.contenders[0].playerName).toBe('Known');
    expect(body.contenders[0].imageUrl).toBe('aj.jpg');
    expect(body.contenders[1].playerName).toBe('Unknown');
    expect(body.contenders[1].wrestlerName).toBe('Unknown');
    expect(body.contenders[1].imageUrl).toBeNull();
  });

  it('calculates movement (previousRank - adjustedRank) and marks new entries', async () => {
    mockGet.mockResolvedValueOnce({ Item: champ('c1', 'Title') });
    mockQueryAll.mockResolvedValue([rankRow('c1', 'p1', 1, 3), rankRow('c1', 'p2', 2, null)]);
    mockGet.mockResolvedValueOnce({ Item: player('p1', 'A', 'X') });
    mockGet.mockResolvedValueOnce({ Item: player('p2', 'B', 'Y') });

    const result = await getContenders(makeEvent({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    const body = JSON.parse(result!.body);

    expect(body.contenders[0].movement).toBe(2);  // 3 - 1
    expect(body.contenders[0].isNew).toBe(false);
    expect(body.contenders[1].movement).toBe(0);   // new entry
    expect(body.contenders[1].isNew).toBe(true);
  });

  it('returns 400 when championshipId path parameter is missing', async () => {
    const result = await getContenders(makeEvent({ pathParameters: null }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Championship ID is required');
  });

  it('returns 404 when championship does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });

    const result = await getContenders(
      makeEvent({ pathParameters: { championshipId: 'bad' } }), ctx, cb,
    );

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Championship not found');
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockGet.mockRejectedValue(new Error('timeout'));

    const result = await getContenders(
      makeEvent({ pathParameters: { championshipId: 'c1' } }), ctx, cb,
    );

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch contenders');
  });
});
