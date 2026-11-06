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
  upsertRanking: vi.fn(),
  findOverride: vi.fn(),
  listActiveOverrides: vi.fn(),
  createOverride: vi.fn(),
  deactivateOverride: vi.fn(),
  writeHistory: vi.fn(),
};

const mockPlayersRepo = {
  findById: vi.fn(async (playerId: string): Promise<{ playerId: string } | null> => ({ playerId })),
};

const mockSeasonsRepo = {
  findById: vi.fn(async (seasonId: string): Promise<Record<string, unknown> | null> => ({
    seasonId,
    name: 'Season 1',
    status: 'active',
  })),
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
    roster: { players: mockPlayersRepo },
    season: { seasons: mockSeasonsRepo },
    runInTransaction: mockRunInTransaction,
  }),
}));

vi.mock('../../../lib/asyncLambda', () => ({
  invokeAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../updateGroupStats', () => ({
  updateGroupStats: vi.fn().mockResolvedValue(undefined),
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

// ---- Single-Elimination Draws ----------------------------------------------

describe('recordResult — single-elimination draws', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a draw before anything is written', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue({ ...base, tournamentId: 't1' });
    mockTournamentsRepo.findById.mockResolvedValue({ tournamentId: 't1', type: 'single-elimination' });

    const r = await recordResult(ev({ winners: ['p1', 'p2'], losers: [], isDraw: true }), ctx, cb);

    expect(r!.statusCode).toBe(400);
    expect(mockRunInTransaction).not.toHaveBeenCalled();
  });
});

// ---- Round-Robin Tests -----------------------------------------------------

describe('recordResult — round-robin tournament', () => {
  beforeEach(() => vi.clearAllMocks());

  function stubRR(
    standings: Record<string, unknown>,
    participants: string[],
    status = 'in-progress',
    tournamentMatches: Array<Record<string, unknown>> = [],
  ) {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue({ ...base, participants, tournamentId: 't1' });
    mockMatchesRepo.listByTournament.mockResolvedValue(tournamentMatches);
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

  const played = (matchId: string, participants: string[], winners: string[], extra: object = {}) => ({
    matchId, participants, winners, status: 'completed', ...extra,
  });

  it('stays in progress until every pairing has been played', async () => {
    // 3 participants = 3 expected matches; this result is only the second.
    stubRR(
      {
        p1: { wins: 1, losses: 0, draws: 0, points: 2 },
        p2: { wins: 0, losses: 0, draws: 0, points: 0 },
        p3: { wins: 0, losses: 1, draws: 0, points: 0 },
      },
      ['p1', 'p2', 'p3'],
      'in-progress',
      [played('m0', ['p1', 'p3'], ['p1']), { matchId: 'mX', participants: ['p1', 'p2'], status: 'scheduled' }],
    );
    await recordResult(ev({ winners: ['p2'], losers: ['p3'] }), ctx, cb);

    expect(mockTournamentsRepo.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ status: 'in-progress' }),
    );
  });

  it('completes when the last pairing is recorded and crowns the points leader', async () => {
    stubRR(
      {
        p1: { wins: 2, losses: 0, draws: 0, points: 4 },
        p2: { wins: 0, losses: 1, draws: 0, points: 0 },
        p3: { wins: 0, losses: 1, draws: 0, points: 0 },
      },
      ['p1', 'p2', 'p3'],
      'in-progress',
      [played('m0', ['p1', 'p3'], ['p1']), played('m9', ['p1', 'p2'], ['p1'])],
    );
    await recordResult(ev({ winners: ['p2'], losers: ['p3'] }), ctx, cb);

    expect(mockTournamentsRepo.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ status: 'completed', winner: 'p1' }),
    );
  });

  it('counts the current match once even when the index already includes it', async () => {
    stubRR(
      {},
      ['p1', 'p2', 'p3'],
      'in-progress',
      [played('m0', ['p1', 'p3'], ['p1']), played('m1', ['p1', 'p2'], ['p1'])],
    );
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    expect(mockTournamentsRepo.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ status: 'in-progress' }),
    );
  });

  it('completes a tournament whose last match is a draw', async () => {
    stubRR(
      {
        p1: { wins: 1, losses: 0, draws: 0, points: 2 },
        p2: { wins: 0, losses: 1, draws: 0, points: 0 },
      },
      ['p1', 'p2'],
      'in-progress',
      [],
    );
    await recordResult(ev({ winners: ['p1', 'p2'], losers: [], isDraw: true }), ctx, cb);

    expect(mockTournamentsRepo.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ status: 'completed', winner: 'p1' }),
    );
  });

  it('breaks a points tie on wins before head-to-head', async () => {
    // p2 is listed first and level on points, but p1 has more wins.
    stubRR(
      {
        p2: { wins: 0, losses: 0, draws: 3, points: 3 },
        p1: { wins: 0, losses: 0, draws: 0, points: 1 },
      },
      ['p1', 'p2'],
    );
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    expect(mockTournamentsRepo.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ status: 'completed', winner: 'p1' }),
    );
  });

  it('breaks a tie on points and wins by head-to-head result', async () => {
    // p3 and p1 finish level; p3 beat p1, even though p1 comes first by id and key order.
    stubRR(
      {
        p1: { wins: 1, losses: 1, draws: 0, points: 2 },
        p2: { wins: 0, losses: 1, draws: 0, points: 0 },
        p3: { wins: 0, losses: 1, draws: 0, points: 0 },
      },
      ['p1', 'p2', 'p3'],
      'in-progress',
      [played('m0', ['p1', 'p3'], ['p3']), played('m9', ['p1', 'p2'], ['p1'])],
    );
    mockMatchesRepo.findByIdWithDate.mockResolvedValue({
      ...base, participants: ['p2', 'p3'], tournamentId: 't1',
    });
    await recordResult(ev({ winners: ['p3'], losers: ['p2'] }), ctx, cb);

    expect(mockTournamentsRepo.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ status: 'completed', winner: 'p3' }),
    );
  });

  it('settles a tie that survives every step on the lowest playerId', async () => {
    // Three-way cycle: each player has one win, one loss and one head-to-head win.
    stubRR(
      {
        p3: { wins: 1, losses: 0, draws: 0, points: 2 },
        p2: { wins: 0, losses: 1, draws: 0, points: 0 },
        p1: { wins: 1, losses: 1, draws: 0, points: 2 },
      },
      ['p1', 'p2', 'p3'],
      'in-progress',
      [played('m0', ['p1', 'p2'], ['p1']), played('m9', ['p1', 'p3'], ['p3'])],
    );
    mockMatchesRepo.findByIdWithDate.mockResolvedValue({
      ...base, participants: ['p2', 'p3'], tournamentId: 't1',
    });
    await recordResult(ev({ winners: ['p2'], losers: ['p3'] }), ctx, cb);

    expect(mockTournamentsRepo.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ status: 'completed', winner: 'p1' }),
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

  it('does not let a card whose match is gone hold the event open', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(base);
    stubCoreTransaction();
    mockEventsRepo.list.mockResolvedValue([
      { eventId: 'e1', status: 'in-progress', matchCards: [{ matchId: 'm1' }, { matchId: 'gone' }] },
    ]);
    mockMatchesRepo.findById
      .mockResolvedValueOnce({ matchId: 'm1', status: 'completed' })
      .mockResolvedValueOnce(null);
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
