import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const mockContendersRepo = {
  listByChampionship: vi.fn(),
  listByChampionshipRanked: vi.fn(),
  deleteAllForChampionship: vi.fn(),
  upsertRanking: vi.fn(),
  findOverride: vi.fn(),
  listActiveOverrides: vi.fn(),
  createOverride: vi.fn(),
  deactivateOverride: vi.fn(),
  writeHistory: vi.fn(),
};

const mockChampionshipsRepo = {
  findById: vi.fn(),
  list: vi.fn(),
  listActive: vi.fn(),
  listHistory: vi.fn(),
  listAllHistory: vi.fn(),
  findCurrentReign: vi.fn(),
};

const mockPlayersRepo = {
  findById: vi.fn(),
  findByUserId: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    contenders: mockContendersRepo,
    championships: mockChampionshipsRepo,
    players: mockPlayersRepo,
  }),
}));

const { mockCalcRankings } = vi.hoisted(() => ({ mockCalcRankings: vi.fn() }));

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

/** Shorthand for a ContenderRanking row. */
function rankRow(cid: string, pid: string, rank: number, prev: number | null = null) {
  return {
    championshipId: cid, playerId: pid, rank, rankingScore: 80,
    winPercentage: 70, currentStreak: 2, matchesInPeriod: 5,
    winsInPeriod: 4, previousRank: prev, calculatedAt: '2025-01-15T00:00:00Z',
    updatedAt: '2025-01-15T00:00:00Z',
  };
}

function champ(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    championshipId: id, name, type: 'singles' as const, isActive: true,
    createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
    ...extra,
  };
}

function player(id: string, name: string, wrestler: string, img?: string) {
  return {
    playerId: id, name, currentWrestler: wrestler,
    wins: 0, losses: 0, draws: 0,
    createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
    ...(img ? { imageUrl: img } : {}),
  };
}

// ─── calculateRankings ──────────────────────────────────────────────

describe('calculateRankings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContendersRepo.upsertRanking.mockResolvedValue({});
    mockContendersRepo.writeHistory.mockResolvedValue({});
    mockContendersRepo.deleteAllForChampionship.mockResolvedValue(undefined);
    mockContendersRepo.listActiveOverrides.mockResolvedValue([]);
  });

  it('calculates rankings via rankingCalculator and writes results', async () => {
    mockChampionshipsRepo.listActive.mockResolvedValue([champ('c1', 'World Title')]);
    mockContendersRepo.listByChampionship.mockResolvedValue([]);
    mockCalcRankings.mockResolvedValue([rankResult('p1', 1)]);

    const result = await calculateRankings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.championshipsProcessed).toBe(1);
    expect(body.totalRankings).toBe(1);
    expect(mockCalcRankings).toHaveBeenCalledWith(
      expect.objectContaining({ championshipId: 'c1', championshipType: 'singles' }),
    );
    expect(mockContendersRepo.upsertRanking).toHaveBeenCalledTimes(1);
    expect(mockContendersRepo.writeHistory).toHaveBeenCalledTimes(1);
  });

  it('preserves previousRank, peakRank, and weeksAtTop from existing rankings', async () => {
    mockChampionshipsRepo.listActive.mockResolvedValue([champ('c1', 'IC Title')]);
    mockContendersRepo.listByChampionship.mockResolvedValue([
      { championshipId: 'c1', playerId: 'p1', rank: 3, peakRank: 2, weeksAtTop: 1 },
    ]);
    mockCalcRankings.mockResolvedValue([rankResult('p1', 1, 90)]);

    await calculateRankings(makeEvent(), ctx, cb);

    expect(mockContendersRepo.upsertRanking).toHaveBeenCalledWith(
      expect.objectContaining({
        previousRank: 3,
        peakRank: 1,       // min(oldPeak=2, newRank=1)
        weeksAtTop: 2,     // rank===1 so incremented from 1 to 2
      }),
    );
  });

  it('deletes old rankings before writing new ones', async () => {
    mockChampionshipsRepo.listActive.mockResolvedValue([champ('c1', 'Tag Title', { type: 'tag' })]);
    mockContendersRepo.listByChampionship.mockResolvedValue([
      { championshipId: 'c1', playerId: 'old-1', rank: 1 },
      { championshipId: 'c1', playerId: 'old-2', rank: 2 },
    ]);
    mockCalcRankings.mockResolvedValue([]);

    await calculateRankings(makeEvent(), ctx, cb);

    expect(mockContendersRepo.deleteAllForChampionship).toHaveBeenCalledWith('c1');
  });

  it('writes ranking history entries with weekKey in YYYY-WW format', async () => {
    mockChampionshipsRepo.listActive.mockResolvedValue([champ('c1', 'World')]);
    mockContendersRepo.listByChampionship.mockResolvedValue([]);
    mockCalcRankings.mockResolvedValue([rankResult('p1', 1)]);

    await calculateRankings(makeEvent(), ctx, cb);

    expect(mockContendersRepo.writeHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 'p1',
        championshipId: 'c1',
        movement: 0, // no previous rank
      }),
    );
    const call = mockContendersRepo.writeHistory.mock.calls[0][0];
    expect(call.weekKey).toMatch(/^c1#\d{4}-\d{2}$/);
  });

  it('filters to a single championship when championshipId is in body', async () => {
    mockChampionshipsRepo.findById.mockResolvedValue(champ('c-x', 'US Title'));
    mockContendersRepo.listByChampionship.mockResolvedValue([]);
    mockContendersRepo.listActiveOverrides.mockResolvedValue([]);
    mockCalcRankings.mockResolvedValue([]);

    const event = makeEvent({ body: JSON.stringify({ championshipId: 'c-x' }) });
    const result = await calculateRankings(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockChampionshipsRepo.findById).toHaveBeenCalledWith('c-x');
    expect(mockChampionshipsRepo.listActive).not.toHaveBeenCalled();
  });

  it('returns success with zero counts when no championships found', async () => {
    mockChampionshipsRepo.listActive.mockResolvedValue([]);

    const result = await calculateRankings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.championshipsProcessed).toBe(0);
    expect(body.totalRankings).toBe(0);
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockChampionshipsRepo.listActive.mockRejectedValue(new Error('DB down'));

    const result = await calculateRankings(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to calculate rankings');
  });
});

// ─── getContenders ──────────────────────────────────────────────────

describe('getContenders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns contenders for a championship ranked by rank', async () => {
    mockChampionshipsRepo.findById.mockResolvedValue(champ('c1', 'World Title', { divisionId: 'raw' }));
    mockContendersRepo.listByChampionshipRanked.mockResolvedValue([rankRow('c1', 'p1', 1, 2)]);
    mockPlayersRepo.findById.mockResolvedValue(player('p1', 'John Cena', 'Cena', 'cena.jpg'));

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
    mockChampionshipsRepo.findById.mockResolvedValue(champ('c1', 'World', { currentChampion: 'champ' }));
    mockContendersRepo.listByChampionshipRanked.mockResolvedValue([
      rankRow('c1', 'champ', 1, 1), rankRow('c1', 'p2', 2, 3), rankRow('c1', 'p3', 3, null),
    ]);
    mockPlayersRepo.findById
      .mockResolvedValueOnce(player('champ', 'The Champ', 'Roman', 'roman.jpg'))
      .mockResolvedValueOnce(player('p2', 'Two', 'Seth'))
      .mockResolvedValueOnce(player('p3', 'Three', 'Drew'));

    const result = await getContenders(makeEvent({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    const body = JSON.parse(result!.body);

    expect(body.contenders).toHaveLength(2);
    expect(body.contenders.find((c: Record<string, unknown>) => c.playerId === 'champ')).toBeUndefined();
    expect(body.contenders[0].rank).toBe(1);
    expect(body.contenders[0].playerId).toBe('p2');
    expect(body.contenders[1].rank).toBe(2);
    expect(body.currentChampion).toMatchObject({
      playerId: 'champ', playerName: 'The Champ', wrestlerName: 'Roman',
    });
  });

  it('enriches contenders with player data and falls back to Unknown', async () => {
    mockChampionshipsRepo.findById.mockResolvedValue(champ('c1', 'IC Title'));
    mockContendersRepo.listByChampionshipRanked.mockResolvedValue([
      rankRow('c1', 'p1', 1, 1), rankRow('c1', 'p-gone', 2, null),
    ]);
    mockPlayersRepo.findById
      .mockResolvedValueOnce(player('p1', 'Known', 'AJ', 'aj.jpg'))
      .mockResolvedValueOnce(null); // player not found

    const result = await getContenders(makeEvent({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    const body = JSON.parse(result!.body);

    expect(body.contenders[0].playerName).toBe('Known');
    expect(body.contenders[0].imageUrl).toBe('aj.jpg');
    expect(body.contenders[1].playerName).toBe('Unknown');
    expect(body.contenders[1].wrestlerName).toBe('Unknown');
    expect(body.contenders[1].imageUrl).toBeNull();
  });

  it('calculates movement (previousRank - adjustedRank) and marks new entries', async () => {
    mockChampionshipsRepo.findById.mockResolvedValue(champ('c1', 'Title'));
    mockContendersRepo.listByChampionshipRanked.mockResolvedValue([
      rankRow('c1', 'p1', 1, 3), rankRow('c1', 'p2', 2, null),
    ]);
    mockPlayersRepo.findById
      .mockResolvedValueOnce(player('p1', 'A', 'X'))
      .mockResolvedValueOnce(player('p2', 'B', 'Y'));

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
    mockChampionshipsRepo.findById.mockResolvedValue(null);

    const result = await getContenders(
      makeEvent({ pathParameters: { championshipId: 'bad' } }), ctx, cb,
    );

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Championship not found');
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockChampionshipsRepo.findById.mockRejectedValue(new Error('timeout'));

    const result = await getContenders(
      makeEvent({ pathParameters: { championshipId: 'c1' } }), ctx, cb,
    );

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch contenders');
  });
});
