import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const mockEventsRepo = {
  findById: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

const mockMatchesRepo = {
  findById: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    user: {
      fantasy: mockFantasyRepo,
    },
    leagueOps: {
      events: mockEventsRepo,
    },
    competition: {
      matches: mockMatchesRepo,
    },
  }),
}));

import { calculateFantasyPoints } from '../calculateFantasyPoints';

// ---- Tests -----------------------------------------------------------------

describe('calculateFantasyPoints', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns early when event not found', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce(null);

    await calculateFantasyPoints('e1');

    expect(mockFantasyRepo.listPicksByEvent).not.toHaveBeenCalled();
    expect(mockFantasyRepo.updatePickScoring).not.toHaveBeenCalled();
  });

  it('returns early when event has no matchCards', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({ eventId: 'e1', matchCards: [] });

    await calculateFantasyPoints('e1');

    expect(mockFantasyRepo.updatePickScoring).not.toHaveBeenCalled();
  });

  it('returns early when no picks exist for event', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({
      eventId: 'e1', matchCards: [{ matchId: 'm1' }],
    });
    mockFantasyRepo.getConfig.mockResolvedValueOnce(null);
    mockMatchesRepo.findById.mockResolvedValueOnce({
      matchId: 'm1', status: 'completed', winners: ['p1'], losers: ['p2'],
    });
    mockFantasyRepo.listPicksByEvent.mockResolvedValueOnce([]);

    await calculateFantasyPoints('e1');

    expect(mockFantasyRepo.updatePickScoring).not.toHaveBeenCalled();
  });

  it('awards base points = (participants - 1) * baseWinPoints for a win', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({
      eventId: 'e1', matchCards: [{ matchId: 'm1' }],
    });
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ baseWinPoints: 10 });
    mockMatchesRepo.findById.mockResolvedValueOnce({
      matchId: 'm1', status: 'completed', winners: ['p1'], losers: ['p2'],
    });
    mockFantasyRepo.listPicksByEvent.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } },
    ]);
    mockFantasyRepo.updatePickScoring.mockResolvedValueOnce(undefined);

    await calculateFantasyPoints('e1');

    expect(mockFantasyRepo.updatePickScoring).toHaveBeenCalledOnce();
    // (2 participants - 1) * 10 = 10
    expect(mockFantasyRepo.updatePickScoring).toHaveBeenCalledWith(
      'e1', 'u1', 10, expect.any(Object),
    );
  });

  it('scales points with match size (3-person match)', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({
      eventId: 'e1', matchCards: [{ matchId: 'm1' }],
    });
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ baseWinPoints: 10 });
    mockMatchesRepo.findById.mockResolvedValueOnce({
      matchId: 'm1', status: 'completed', winners: ['p1'], losers: ['p2', 'p3'],
    });
    mockFantasyRepo.listPicksByEvent.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } },
    ]);
    mockFantasyRepo.updatePickScoring.mockResolvedValueOnce(undefined);

    await calculateFantasyPoints('e1');

    // (3 - 1) * 10 = 20
    expect(mockFantasyRepo.updatePickScoring).toHaveBeenCalledWith(
      'e1', 'u1', 20, expect.any(Object),
    );
  });

  it('adds championship bonus for championship match win', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({
      eventId: 'e1', matchCards: [{ matchId: 'm1' }],
    });
    mockFantasyRepo.getConfig.mockResolvedValueOnce({
      baseWinPoints: 10, championshipBonus: 5, titleWinBonus: 10,
    });
    mockMatchesRepo.findById.mockResolvedValueOnce({
      matchId: 'm1', status: 'completed', isChampionship: true,
      winners: ['p1'], losers: ['p2'],
    });
    mockFantasyRepo.listPicksByEvent.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } },
    ]);
    mockFantasyRepo.updatePickScoring.mockResolvedValueOnce(undefined);

    await calculateFantasyPoints('e1');

    // base (2-1)*10=10 + championship 5 + titleWin 10 = 25
    expect(mockFantasyRepo.updatePickScoring).toHaveBeenCalledWith(
      'e1', 'u1', 25, expect.any(Object),
    );
  });

  it('awards title defense bonus instead of title win when isTitleDefense', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({
      eventId: 'e1', matchCards: [{ matchId: 'm1' }],
    });
    mockFantasyRepo.getConfig.mockResolvedValueOnce({
      baseWinPoints: 10, championshipBonus: 5, titleWinBonus: 10, titleDefenseBonus: 5,
    });
    mockMatchesRepo.findById.mockResolvedValueOnce({
      matchId: 'm1', status: 'completed', isChampionship: true, isTitleDefense: true,
      winners: ['p1'], losers: ['p2'],
    });
    mockFantasyRepo.listPicksByEvent.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } },
    ]);
    mockFantasyRepo.updatePickScoring.mockResolvedValueOnce(undefined);

    await calculateFantasyPoints('e1');

    // base 10 + championship 5 + defense 5 = 20
    expect(mockFantasyRepo.updatePickScoring).toHaveBeenCalledWith(
      'e1', 'u1', 20, expect.any(Object),
    );
  });

  it('gives 0 points for a wrestler who did not compete', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({
      eventId: 'e1', matchCards: [{ matchId: 'm1' }],
    });
    mockFantasyRepo.getConfig.mockResolvedValueOnce(null);
    mockMatchesRepo.findById.mockResolvedValueOnce({
      matchId: 'm1', status: 'completed', winners: ['p2'], losers: ['p3'],
    });
    mockFantasyRepo.listPicksByEvent.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } },
    ]);
    mockFantasyRepo.updatePickScoring.mockResolvedValueOnce(undefined);

    await calculateFantasyPoints('e1');

    expect(mockFantasyRepo.updatePickScoring).toHaveBeenCalledWith(
      'e1', 'u1', 0, expect.objectContaining({
        p1: expect.objectContaining({ reason: 'Did not compete', points: 0 }),
      }),
    );
  });

  it('gives 0 points with "Lost match" for a wrestler who lost', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({
      eventId: 'e1', matchCards: [{ matchId: 'm1' }],
    });
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ baseWinPoints: 10 });
    mockMatchesRepo.findById.mockResolvedValueOnce({
      matchId: 'm1', status: 'completed', winners: ['p2'], losers: ['p1'],
    });
    mockFantasyRepo.listPicksByEvent.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } },
    ]);
    mockFantasyRepo.updatePickScoring.mockResolvedValueOnce(undefined);

    await calculateFantasyPoints('e1');

    expect(mockFantasyRepo.updatePickScoring).toHaveBeenCalledWith(
      'e1', 'u1', 0, expect.objectContaining({
        p1: expect.objectContaining({ reason: 'Lost match', points: 0 }),
      }),
    );
  });

  it('stores breakdown per wrestler in the update', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({
      eventId: 'e1', matchCards: [{ matchId: 'm1' }],
    });
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ baseWinPoints: 10 });
    mockMatchesRepo.findById.mockResolvedValueOnce({
      matchId: 'm1', status: 'completed', winners: ['p1'], losers: ['p2'],
    });
    mockFantasyRepo.listPicksByEvent.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1', 'p2'] } },
    ]);
    mockFantasyRepo.updatePickScoring.mockResolvedValueOnce(undefined);

    await calculateFantasyPoints('e1');

    const breakdown = mockFantasyRepo.updatePickScoring.mock.calls[0][3];
    expect(breakdown.p1).toBeDefined();
    expect(breakdown.p1.points).toBe(10);
    expect(breakdown.p1.multipliers).toEqual(expect.any(Array));
    expect(breakdown.p2).toBeDefined();
    expect(breakdown.p2.points).toBe(0);
  });

  it('only counts completed matches', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({
      eventId: 'e1', matchCards: [{ matchId: 'm1' }, { matchId: 'm2' }],
    });
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ baseWinPoints: 10 });
    // m1 is completed, m2 is in-progress (findById returns non-completed)
    mockMatchesRepo.findById
      .mockResolvedValueOnce({ matchId: 'm1', status: 'completed', winners: ['p1'], losers: ['p2'] })
      .mockResolvedValueOnce({ matchId: 'm2', status: 'in-progress', winners: [], losers: [] });
    mockFantasyRepo.listPicksByEvent.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } },
    ]);
    mockFantasyRepo.updatePickScoring.mockResolvedValueOnce(undefined);

    await calculateFantasyPoints('e1');

    // Only m1 counted: (2-1)*10 = 10
    expect(mockFantasyRepo.updatePickScoring).toHaveBeenCalledWith(
      'e1', 'u1', 10, expect.any(Object),
    );
  });

  it('uses config defaults when config has no values', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({
      eventId: 'e1', matchCards: [{ matchId: 'm1' }],
    });
    mockFantasyRepo.getConfig.mockResolvedValueOnce(null);
    mockMatchesRepo.findById.mockResolvedValueOnce({
      matchId: 'm1', status: 'completed', winners: ['p1'], losers: ['p2'],
    });
    mockFantasyRepo.listPicksByEvent.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } },
    ]);
    mockFantasyRepo.updatePickScoring.mockResolvedValueOnce(undefined);

    await calculateFantasyPoints('e1');

    // Default baseWinPoints = 10, (2-1)*10 = 10
    expect(mockFantasyRepo.updatePickScoring).toHaveBeenCalledWith(
      'e1', 'u1', 10, expect.any(Object),
    );
  });

  it('processes multiple users picks in a single event', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({
      eventId: 'e1', matchCards: [{ matchId: 'm1' }],
    });
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ baseWinPoints: 10 });
    mockMatchesRepo.findById.mockResolvedValueOnce({
      matchId: 'm1', status: 'completed', winners: ['p1'], losers: ['p2'],
    });
    mockFantasyRepo.listPicksByEvent.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } },
      { eventId: 'e1', fantasyUserId: 'u2', picks: { d1: ['p2'] } },
    ]);
    mockFantasyRepo.updatePickScoring.mockResolvedValue(undefined);

    await calculateFantasyPoints('e1');

    expect(mockFantasyRepo.updatePickScoring).toHaveBeenCalledTimes(2);
    // u1 picked winner: 10, u2 picked loser: 0
    expect(mockFantasyRepo.updatePickScoring).toHaveBeenCalledWith(
      'e1', 'u1', 10, expect.any(Object),
    );
    expect(mockFantasyRepo.updatePickScoring).toHaveBeenCalledWith(
      'e1', 'u2', 0, expect.any(Object),
    );
  });

  it('handles event with matchCards undefined (falls back to empty array)', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({ eventId: 'e1' });

    await calculateFantasyPoints('e1');

    expect(mockFantasyRepo.listPicksByEvent).not.toHaveBeenCalled();
    expect(mockFantasyRepo.updatePickScoring).not.toHaveBeenCalled();
  });

  it('handles match with missing winners/losers arrays (defaults to empty)', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({
      eventId: 'e1', matchCards: [{ matchId: 'm1' }],
    });
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ baseWinPoints: 10 });
    mockMatchesRepo.findById.mockResolvedValueOnce({
      matchId: 'm1', status: 'completed',
    });
    mockFantasyRepo.listPicksByEvent.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } },
    ]);
    mockFantasyRepo.updatePickScoring.mockResolvedValueOnce(undefined);

    await calculateFantasyPoints('e1');

    expect(mockFantasyRepo.updatePickScoring).toHaveBeenCalledOnce();
    expect(mockFantasyRepo.updatePickScoring).toHaveBeenCalledWith(
      'e1', 'u1', 0, expect.objectContaining({
        p1: expect.objectContaining({ reason: 'Did not compete', points: 0 }),
      }),
    );
  });

  it('handles pick record with undefined picks object (defaults to empty)', async () => {
    mockEventsRepo.findById.mockResolvedValueOnce({
      eventId: 'e1', matchCards: [{ matchId: 'm1' }],
    });
    mockFantasyRepo.getConfig.mockResolvedValueOnce({ baseWinPoints: 10 });
    mockMatchesRepo.findById.mockResolvedValueOnce({
      matchId: 'm1', status: 'completed', winners: ['p1'], losers: ['p2'],
    });
    mockFantasyRepo.listPicksByEvent.mockResolvedValueOnce([
      { eventId: 'e1', fantasyUserId: 'u1' },
    ]);
    mockFantasyRepo.updatePickScoring.mockResolvedValueOnce(undefined);

    await calculateFantasyPoints('e1');

    expect(mockFantasyRepo.updatePickScoring).toHaveBeenCalledOnce();
    expect(mockFantasyRepo.updatePickScoring).toHaveBeenCalledWith(
      'e1', 'u1', 0, {},
    );
  });
});
