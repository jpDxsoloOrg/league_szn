import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Repository Mocks -----------------------------------------------------

const mockMatchesRepo = {
  findById: vi.fn(),
  findByIdWithDate: vi.fn(),
  list: vi.fn(),
  listCompleted: vi.fn(),
  listByStatus: vi.fn(),
  listByTournament: vi.fn(),
  listBySeason: vi.fn(),
  delete: vi.fn(),
};

const mockChampionshipsRepo = {
  findById: vi.fn(),
  list: vi.fn(),
  listActive: vi.fn(),
  listHistory: vi.fn(),
  listAllHistory: vi.fn(),
  findCurrentReign: vi.fn(),
  update: vi.fn(),
  removeChampion: vi.fn(),
  closeReign: vi.fn(),
  reopenReign: vi.fn(),
  deleteHistoryEntry: vi.fn(),
  incrementDefenses: vi.fn(),
  decrementDefenses: vi.fn(),
};

const mockTournamentsRepo = {
  findById: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
};

const mockEventsRepo = {
  findById: vi.fn(),
  list: vi.fn(),
  listByStatus: vi.fn(),
  listBySeason: vi.fn(),
  listByEventType: vi.fn(),
  listByDateRange: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getCheckIn: vi.fn(),
  listCheckIns: vi.fn(),
  upsertCheckIn: vi.fn(),
  deleteCheckIn: vi.fn(),
};

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

const mockRunInTransaction = vi.fn();

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    competition: {
      matches: mockMatchesRepo,
      championships: mockChampionshipsRepo,
      tournaments: mockTournamentsRepo,
      contenders: mockContendersRepo,
    },
    leagueOps: {
      events: mockEventsRepo,
    },
    runInTransaction: mockRunInTransaction,
  }),
}));

vi.mock('../../../lib/asyncLambda', () => ({
  invokeAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../updateGroupStats', () => ({
  updateGroupStats: vi.fn().mockResolvedValue(undefined),
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
    resource: '', requestContext: { authorizer: {} } as never,
  };
}

/** Captured tx objects from each runInTransaction call */
let capturedTxCalls: Array<Record<string, ReturnType<typeof vi.fn>>>;

function stubChamp(champData: Record<string, unknown>, reign?: Record<string, unknown>) {
  capturedTxCalls = [];

  mockMatchesRepo.findByIdWithDate.mockResolvedValue(champMatch);
  mockChampionshipsRepo.findById.mockResolvedValue(champData);
  mockChampionshipsRepo.findCurrentReign.mockResolvedValue(reign ?? null);
  mockChampionshipsRepo.incrementDefenses.mockResolvedValue(undefined);
  mockContendersRepo.findOverride.mockResolvedValue(null);
  mockEventsRepo.list.mockResolvedValue([]);

  mockRunInTransaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
    const tx = {
      updateMatch: vi.fn(),
      incrementPlayerRecord: vi.fn(),
      incrementStanding: vi.fn(),
      updateChampionship: vi.fn(),
      closeReign: vi.fn(),
      startReign: vi.fn(),
    };
    await fn(tx);
    capturedTxCalls.push(tx);
    return tx;
  });
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

    // The title-change transaction is the last runInTransaction call
    // First call = core transaction, second = isTitleDefense update, third = title change
    const champTx = capturedTxCalls[capturedTxCalls.length - 1];
    // Update currentChampion
    expect(champTx.updateChampionship).toHaveBeenCalledWith('c1', { currentChampion: 'p1' });
    // Close old reign
    expect(champTx.closeReign).toHaveBeenCalledWith(
      'c1', '2024-01-01T00:00:00Z', expect.any(String), expect.any(Number),
    );
    // New reign
    expect(champTx.startReign).toHaveBeenCalledWith(expect.objectContaining({
      championshipId: 'c1',
      champion: 'p1',
      defenses: 0,
    }));
  });

  it('sets isTitleDefense to false on title change', async () => {
    stubChamp(
      { championshipId: 'c1', currentChampion: 'p2' },
      { championshipId: 'c1', wonDate: '2024-01-01T00:00:00Z', champion: 'p2' },
    );
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    // The isTitleDefense update goes through runInTransaction
    // Find the tx call that updated isTitleDefense on the match
    const itdTx = capturedTxCalls.find(
      (tx) => tx.updateMatch.mock.calls.some(
        (c: unknown[]) => (c[2] as Record<string, unknown>).isTitleDefense === false,
      ),
    );
    expect(itdTx).toBeDefined();
  });

  it('creates new reign without closing old when no previous champion', async () => {
    stubChamp({ championshipId: 'c1', currentChampion: undefined });
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    const champTx = capturedTxCalls[capturedTxCalls.length - 1];
    // Update champion + new reign only (no close old reign)
    expect(champTx.updateChampionship).toHaveBeenCalledWith('c1', { currentChampion: 'p1' });
    expect(champTx.startReign).toHaveBeenCalledWith(expect.objectContaining({
      champion: 'p1',
    }));
    expect(champTx.closeReign).not.toHaveBeenCalled();
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

    // isTitleDefense should be true
    const itdTx = capturedTxCalls.find(
      (tx) => tx.updateMatch.mock.calls.some(
        (c: unknown[]) => (c[2] as Record<string, unknown>).isTitleDefense === true,
      ),
    );
    expect(itdTx).toBeDefined();

    // Should increment defenses on the current reign
    expect(mockChampionshipsRepo.incrementDefenses).toHaveBeenCalledWith('c1', '2024-01-01T00:00:00Z');
  });

  it('detects tag team title defense with reversed winner order', async () => {
    stubChamp(
      { championshipId: 'c1', currentChampion: ['p1', 'p2'] },
      { championshipId: 'c1', wonDate: '2024-01-01T00:00:00Z', champion: ['p1', 'p2'] },
    );
    // Winners in reversed order from currentChampion
    await recordResult(ev({ winners: ['p2', 'p1'], losers: ['p3', 'p4'] }), ctx, cb);

    // isTitleDefense should be true (sorted comparison matches)
    const itdTx = capturedTxCalls.find(
      (tx) => tx.updateMatch.mock.calls.some(
        (c: unknown[]) => (c[2] as Record<string, unknown>).isTitleDefense === true,
      ),
    );
    expect(itdTx).toBeDefined();
  });

  it('tag team title change when different team wins', async () => {
    stubChamp(
      { championshipId: 'c1', currentChampion: ['p1', 'p2'] },
      { championshipId: 'c1', wonDate: '2024-01-01T00:00:00Z', champion: ['p1', 'p2'] },
    );
    await recordResult(ev({ winners: ['p3', 'p4'], losers: ['p1', 'p2'] }), ctx, cb);

    // isTitleDefense should be false
    const itdTx = capturedTxCalls.find(
      (tx) => tx.updateMatch.mock.calls.some(
        (c: unknown[]) => (c[2] as Record<string, unknown>).isTitleDefense === false,
      ),
    );
    expect(itdTx).toBeDefined();

    // Title change transaction
    const champTx = capturedTxCalls[capturedTxCalls.length - 1];
    expect(champTx.updateChampionship).toHaveBeenCalledWith('c1', { currentChampion: ['p3', 'p4'] });
    // Close old + new reign
    expect(champTx.closeReign).toHaveBeenCalled();
    expect(champTx.startReign).toHaveBeenCalled();
  });
});
