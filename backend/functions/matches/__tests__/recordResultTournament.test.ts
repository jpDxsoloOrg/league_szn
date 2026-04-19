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
    matches: mockMatchesRepo,
    championships: mockChampionshipsRepo,
    tournaments: mockTournamentsRepo,
    events: mockEventsRepo,
    contenders: mockContendersRepo,
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
const base = { matchId: 'm1', date: '2024-06-01', status: 'pending', participants: ['p1', 'p2'] };

function ev(body: object): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body), headers: {}, multiValueHeaders: {},
    httpMethod: 'POST', isBase64Encoded: false, path: '/',
    pathParameters: { matchId: 'm1' }, queryStringParameters: null,
    multiValueQueryStringParameters: null, stageVariables: null,
    resource: '', requestContext: { authorizer: {} } as never,
  };
}

function stubCoreTransaction() {
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
    return tx;
  });
}

// ---- Round-Robin Tests -----------------------------------------------------

describe('recordResult — round-robin tournament', () => {
  beforeEach(() => vi.clearAllMocks());

  function stubRR(standings: Record<string, unknown>, participants: string[], status = 'in-progress') {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue({ ...base, tournamentId: 't1' });
    stubCoreTransaction();
    mockTournamentsRepo.findById.mockResolvedValue({
      tournamentId: 't1', type: 'round-robin', standings, participants, status,
    });
    mockTournamentsRepo.update.mockResolvedValue(undefined);
    mockEventsRepo.list.mockResolvedValue([]);
  }

  it('updates standings: winner +1 win/+2 pts, loser +1 loss/+0 pts', async () => {
    stubRR(
      { p1: { wins: 0, losses: 0, draws: 0, points: 0 }, p2: { wins: 0, losses: 0, draws: 0, points: 0 } },
      ['p1', 'p2', 'p3'],
    );
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    expect(mockTournamentsRepo.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        standings: expect.objectContaining({
          p1: expect.objectContaining({ wins: 1, points: 2 }),
          p2: expect.objectContaining({ losses: 1, points: 0 }),
        }),
      }),
    );
  });

  // Note: Draw detection requires winners === losers (sorted), but the overlap
  // validation returns 400 before reaching draw logic. Draw paths are unreachable.

  it('does not complete tournament when totalMatchesPlayed formula has not reached threshold', async () => {
    // The completion formula uses (wins + draws) / 2 which only counts wins at half-rate.
    // 3 participants = 3 expected matches, but 3 wins / 2 = 1.5 < 3, so stays in-progress.
    stubRR(
      {
        p1: { wins: 2, losses: 0, draws: 0, points: 4 },
        p2: { wins: 0, losses: 1, draws: 0, points: 0 },
        p3: { wins: 0, losses: 1, draws: 0, points: 0 },
      },
      ['p1', 'p2', 'p3'],
    );
    await recordResult(ev({ winners: ['p2'], losers: ['p3'] }), ctx, cb);

    expect(mockTournamentsRepo.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ status: 'in-progress' }),
    );
  });

  it('transitions from upcoming to in-progress on first result', async () => {
    stubRR({}, ['p1', 'p2', 'p3'], 'upcoming');
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    expect(mockTournamentsRepo.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ status: 'in-progress' }),
    );
  });

  it('initializes standings for new participants not yet in standings', async () => {
    stubRR({}, ['p1', 'p2', 'p3']);
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    expect(mockTournamentsRepo.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        standings: expect.objectContaining({
          p1: expect.objectContaining({ wins: expect.any(Number) }),
          p2: expect.objectContaining({ losses: expect.any(Number) }),
        }),
      }),
    );
  });
});

// ---- Single Elimination Tests ----------------------------------------------

describe('recordResult — single-elimination tournament', () => {
  beforeEach(() => vi.clearAllMocks());

  function stubSE(brackets: unknown, status = 'in-progress') {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue({ ...base, tournamentId: 't1', participants: ['p1', 'p2'] });
    stubCoreTransaction();
    mockTournamentsRepo.findById.mockResolvedValue({
      tournamentId: 't1', type: 'single-elimination', brackets, status,
    });
    mockTournamentsRepo.update.mockResolvedValue(undefined);
    mockEventsRepo.list.mockResolvedValue([]);
  }

  it('advances winner to next round (first of pair -> participant1)', async () => {
    stubSE({
      rounds: [
        { matches: [{ participant1: 'p1', participant2: 'p2' }, { participant1: 'p3', participant2: 'p4' }] },
        { matches: [{ participant1: null, participant2: null }] },
      ],
    });
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    expect(mockTournamentsRepo.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        brackets: expect.objectContaining({
          rounds: expect.arrayContaining([
            expect.anything(),
            expect.objectContaining({
              matches: [expect.objectContaining({ participant1: 'p1' })],
            }),
          ]),
        }),
      }),
    );
  });

  it('advances second-of-pair winner to participant2 in next round', async () => {
    const match = { ...base, tournamentId: 't1', participants: ['p3', 'p4'] };
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(match);
    stubCoreTransaction();
    mockTournamentsRepo.findById.mockResolvedValue({
      tournamentId: 't1', type: 'single-elimination', status: 'in-progress',
      brackets: {
        rounds: [
          { matches: [{ participant1: 'p1', participant2: 'p2', winner: 'p1' }, { participant1: 'p3', participant2: 'p4' }] },
          { matches: [{ participant1: 'p1', participant2: null }] },
        ],
      },
    });
    mockTournamentsRepo.update.mockResolvedValue(undefined);
    mockEventsRepo.list.mockResolvedValue([]);

    await recordResult(ev({ winners: ['p3'], losers: ['p4'] }), ctx, cb);

    expect(mockTournamentsRepo.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        brackets: expect.objectContaining({
          rounds: expect.arrayContaining([
            expect.anything(),
            expect.objectContaining({
              matches: [expect.objectContaining({ participant1: 'p1', participant2: 'p3' })],
            }),
          ]),
        }),
      }),
    );
  });

  it('completes tournament when final round match decided', async () => {
    stubSE({
      rounds: [{ matches: [{ participant1: 'p1', participant2: 'p2' }] }],
    });
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    expect(mockTournamentsRepo.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        status: 'completed',
        winner: 'p1',
      }),
    );
  });

  it('transitions from upcoming to in-progress on first bracket result', async () => {
    stubSE({
      rounds: [
        { matches: [{ participant1: 'p1', participant2: 'p2' }, { participant1: 'p3', participant2: 'p4' }] },
        { matches: [{ participant1: null, participant2: null }] },
      ],
    }, 'upcoming');
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    expect(mockTournamentsRepo.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ status: 'in-progress' }),
    );
  });
});

// ---- Event Auto-Complete Tests ---------------------------------------------

describe('recordResult — event auto-complete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks event completed when all matches are done', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(base);
    stubCoreTransaction();
    mockEventsRepo.list.mockResolvedValue([
      { eventId: 'e1', status: 'upcoming', matchCards: [{ matchId: 'm1' }, { matchId: 'm2' }] },
    ]);
    // findById is used per match to check completion status
    mockMatchesRepo.findById
      .mockResolvedValueOnce({ matchId: 'm1', status: 'completed' })
      .mockResolvedValueOnce({ matchId: 'm2', status: 'completed' });
    mockEventsRepo.update.mockResolvedValue(undefined);

    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    expect(mockEventsRepo.update).toHaveBeenCalledWith('e1', { status: 'completed' });
  });

  it('marks upcoming event as in-progress when some matches still pending', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(base);
    stubCoreTransaction();
    mockEventsRepo.list.mockResolvedValue([
      { eventId: 'e1', status: 'upcoming', matchCards: [{ matchId: 'm1' }, { matchId: 'm2' }] },
    ]);
    mockMatchesRepo.findById
      .mockResolvedValueOnce({ matchId: 'm1', status: 'completed' })
      .mockResolvedValueOnce({ matchId: 'm2', status: 'scheduled' });
    mockEventsRepo.update.mockResolvedValue(undefined);

    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    expect(mockEventsRepo.update).toHaveBeenCalledWith('e1', { status: 'in-progress' });
  });

  it('does not change status for already in-progress event with pending matches', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(base);
    stubCoreTransaction();
    mockEventsRepo.list.mockResolvedValue([
      { eventId: 'e1', status: 'in-progress', matchCards: [{ matchId: 'm1' }, { matchId: 'm2' }] },
    ]);
    mockMatchesRepo.findById
      .mockResolvedValueOnce({ matchId: 'm1', status: 'completed' })
      .mockResolvedValueOnce({ matchId: 'm2', status: 'scheduled' });

    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    // Should NOT update event status since it is already in-progress
    expect(mockEventsRepo.update).not.toHaveBeenCalled();
  });

  it('succeeds even if auto-complete throws', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(base);
    stubCoreTransaction();
    // events.list throws
    mockEventsRepo.list.mockRejectedValue(new Error('event list fail'));

    const r = await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);
    expect(r!.statusCode).toBe(200);
  });
});
