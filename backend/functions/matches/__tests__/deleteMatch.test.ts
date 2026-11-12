import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Repository Mocks -----------------------------------------------------

const {
  mockMatches,
  mockChampionships,
  mockTournaments,
  mockPlayers,
  mockSeasons,
  mockEvents,
  mockRunInTransaction,
} = vi.hoisted(() => ({
  mockMatches: { findByIdWithDate: vi.fn(), findById: vi.fn(), delete: vi.fn() },
  mockChampionships: {
    listHistory: vi.fn(),
    deleteHistoryEntry: vi.fn(),
    reopenReign: vi.fn(),
    update: vi.fn(),
    removeChampion: vi.fn(),
    findCurrentReign: vi.fn(),
    decrementDefenses: vi.fn(),
  },
  mockTournaments: { findById: vi.fn(), update: vi.fn(), removeWinner: vi.fn() },
  mockPlayers: { findById: vi.fn() },
  mockSeasons: { findById: vi.fn() },
  mockEvents: { findById: vi.fn(), update: vi.fn() },
  mockRunInTransaction: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    competition: { matches: mockMatches, championships: mockChampionships, tournaments: mockTournaments },
    roster: { players: mockPlayers },
    season: { seasons: mockSeasons },
    leagueOps: { events: mockEvents },
    runInTransaction: mockRunInTransaction,
  }),
}));

vi.mock('../../../lib/asyncLambda', () => ({ invokeAsync: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../revertGroupStats', () => ({ revertGroupStats: vi.fn().mockResolvedValue(undefined) }));

import { handler as deleteMatch } from '../deleteMatch';

// ---- Helpers ---------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};

function ev(): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'DELETE',
    isBase64Encoded: false, path: '/', pathParameters: { matchId: 'm1' },
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: {
      authorizer: { groups: 'Moderator', principalId: 'sub-1', username: 't', email: 't@t' },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

const completed = {
  matchId: 'm1',
  date: '2024-06-10T00:00:00Z',
  status: 'completed',
  participants: ['p1', 'p2'],
  winners: ['p1'],
  losers: ['p2'],
};

const titleMatch = { ...completed, isChampionship: true, championshipId: 'c1' };

interface FakeTx {
  incrementPlayerRecord: ReturnType<typeof vi.fn>;
  incrementStanding: ReturnType<typeof vi.fn>;
}

function captureTx(): FakeTx {
  const tx: FakeTx = { incrementPlayerRecord: vi.fn(), incrementStanding: vi.fn() };
  mockRunInTransaction.mockImplementation(async (fn: (tx: FakeTx) => Promise<unknown>) => {
    await fn(tx);
  });
  return tx;
}

function expectNothingWritten() {
  expect(mockRunInTransaction).not.toHaveBeenCalled();
  expect(mockChampionships.deleteHistoryEntry).not.toHaveBeenCalled();
  expect(mockChampionships.reopenReign).not.toHaveBeenCalled();
  expect(mockTournaments.update).not.toHaveBeenCalled();
  expect(mockMatches.delete).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPlayers.findById.mockImplementation(async (playerId: string) => ({ playerId }));
  mockSeasons.findById.mockImplementation(async (seasonId: string) => ({ seasonId }));
  mockChampionships.listHistory.mockResolvedValue([]);
  mockChampionships.findCurrentReign.mockResolvedValue(null);
});

// ---- Championship guards ---------------------------------------------------

describe('deleteMatch — title reign guard', () => {
  it('returns 409 and writes nothing when the reign was followed by another', async () => {
    mockMatches.findByIdWithDate.mockResolvedValue(titleMatch);
    mockChampionships.listHistory.mockResolvedValue([
      { championshipId: 'c1', wonDate: '2024-01-01T00:00:00Z', champion: 'pB', lostDate: '2024-06-10T00:00:00Z' },
      { championshipId: 'c1', wonDate: '2024-06-10T00:00:00Z', champion: 'p1', matchId: 'm1', lostDate: '2024-07-01T00:00:00Z' },
      { championshipId: 'c1', wonDate: '2024-07-01T00:00:00Z', champion: 'pC', matchId: 'm2' },
    ]);

    const r = await deleteMatch(ev(), ctx, cb);

    expect(r!.statusCode).toBe(409);
    expectNothingWritten();
  });

  it('returns 409 when the reign ended in a vacancy', async () => {
    mockMatches.findByIdWithDate.mockResolvedValue(titleMatch);
    mockChampionships.listHistory.mockResolvedValue([
      { championshipId: 'c1', wonDate: '2024-06-10T00:00:00Z', champion: 'p1', matchId: 'm1', lostDate: '2024-07-01T00:00:00Z' },
    ]);

    const r = await deleteMatch(ev(), ctx, cb);

    expect(r!.statusCode).toBe(409);
    expectNothingWritten();
  });

  it('returns 409 when a newer reign exists even if this one was never closed', async () => {
    mockMatches.findByIdWithDate.mockResolvedValue(titleMatch);
    mockChampionships.listHistory.mockResolvedValue([
      { championshipId: 'c1', wonDate: '2024-06-10T00:00:00Z', champion: 'p1', matchId: 'm1' },
      { championshipId: 'c1', wonDate: '2024-07-01T00:00:00Z', champion: 'pC', matchId: 'm2' },
    ]);

    const r = await deleteMatch(ev(), ctx, cb);

    expect(r!.statusCode).toBe(409);
    expectNothingWritten();
  });

  it('rolls back the current reign and restores the previous champion', async () => {
    const tx = captureTx();
    mockMatches.findByIdWithDate.mockResolvedValue(titleMatch);
    const previous = { championshipId: 'c1', wonDate: '2024-01-01T00:00:00Z', champion: 'pB', lostDate: '2024-06-10T00:00:00Z' };
    const created = { championshipId: 'c1', wonDate: '2024-06-10T00:00:00Z', champion: 'p1', matchId: 'm1' };
    mockChampionships.listHistory
      .mockResolvedValueOnce([previous, created])
      .mockResolvedValueOnce([previous, created])
      .mockResolvedValueOnce([previous]);

    const r = await deleteMatch(ev(), ctx, cb);

    expect(r!.statusCode).toBe(200);
    expect(tx.incrementPlayerRecord).toHaveBeenCalledWith('p1', { wins: -1 });
    expect(mockChampionships.deleteHistoryEntry).toHaveBeenCalledWith('c1', created.wonDate);
    expect(mockChampionships.reopenReign).toHaveBeenCalledWith('c1', previous.wonDate);
    expect(mockChampionships.update).toHaveBeenCalledWith('c1', { currentChampion: 'pB' });
    expect(mockMatches.delete).toHaveBeenCalledWith('m1', completed.date);
  });

  it('restores the previous tag reign team link, or clears it for a random pairing (TTC-10)', async () => {
    captureTx();
    mockMatches.findByIdWithDate.mockResolvedValue(titleMatch);
    const linked = { championshipId: 'c1', wonDate: '2024-01-01T00:00:00Z', champion: ['pA', 'pB'], tagTeamId: 'tt1', lostDate: '2024-06-10T00:00:00Z' };
    const created = { championshipId: 'c1', wonDate: '2024-06-10T00:00:00Z', champion: ['p1', 'p2'], tagTeamId: 'tt2', matchId: 'm1' };
    mockChampionships.listHistory
      .mockResolvedValueOnce([linked, created])
      .mockResolvedValueOnce([linked, created])
      .mockResolvedValueOnce([linked]);

    await deleteMatch(ev(), ctx, cb);
    expect(mockChampionships.update).toHaveBeenCalledWith('c1', { currentChampion: ['pA', 'pB'], currentTagTeamId: 'tt1' });

    vi.clearAllMocks();
    captureTx();
    mockMatches.findByIdWithDate.mockResolvedValue(titleMatch);
    const randomPair = { ...linked, tagTeamId: undefined };
    mockChampionships.listHistory
      .mockResolvedValueOnce([randomPair, created])
      .mockResolvedValueOnce([randomPair, created])
      .mockResolvedValueOnce([randomPair]);

    await deleteMatch(ev(), ctx, cb);
    expect(mockChampionships.update).toHaveBeenCalledWith('c1', { currentChampion: ['pA', 'pB'], currentTagTeamId: null });
  });
});

describe('deleteMatch — title defense rollback', () => {
  const currentReign = { championshipId: 'c1', wonDate: '2024-01-01T00:00:00Z', champion: 'p1', defenses: 2 };

  it('decrements the current reign for a defense fought during it', async () => {
    captureTx();
    mockMatches.findByIdWithDate.mockResolvedValue({ ...titleMatch, isTitleDefense: true });
    mockChampionships.findCurrentReign.mockResolvedValue(currentReign);

    await deleteMatch(ev(), ctx, cb);

    expect(mockChampionships.decrementDefenses).toHaveBeenCalledWith('c1', currentReign.wonDate);
  });

  it('decrements for a defense later on the card that crowned the champion', async () => {
    captureTx();
    // An event match carries its date alone; the reign started when the earlier
    // title change was recorded that evening.
    mockMatches.findByIdWithDate.mockResolvedValue({ ...titleMatch, isTitleDefense: true, date: '2024-08-01' });
    const sameDayReign = { ...currentReign, wonDate: '2024-08-01T21:00:00.000Z', defenses: 1 };
    mockChampionships.findCurrentReign.mockResolvedValue(sameDayReign);

    await deleteMatch(ev(), ctx, cb);

    expect(mockChampionships.decrementDefenses).toHaveBeenCalledWith('c1', sameDayReign.wonDate);
  });

  it('leaves the current reign alone for a defense from before it began', async () => {
    captureTx();
    mockMatches.findByIdWithDate.mockResolvedValue({
      ...titleMatch, isTitleDefense: true, date: '2023-12-01T00:00:00Z',
    });
    mockChampionships.findCurrentReign.mockResolvedValue(currentReign);

    const r = await deleteMatch(ev(), ctx, cb);

    expect(r!.statusCode).toBe(200);
    expect(mockChampionships.decrementDefenses).not.toHaveBeenCalled();
  });

  it('does not decrement when the match is not flagged as a defense', async () => {
    captureTx();
    mockMatches.findByIdWithDate.mockResolvedValue(titleMatch);
    mockChampionships.findCurrentReign.mockResolvedValue(currentReign);

    await deleteMatch(ev(), ctx, cb);

    expect(mockChampionships.decrementDefenses).not.toHaveBeenCalled();
  });

  it('skips the championship rollback entirely for a draw', async () => {
    const tx = captureTx();
    mockMatches.findByIdWithDate.mockResolvedValue({
      ...titleMatch, isDraw: true, winners: ['p1', 'p2'], losers: [],
    });
    mockChampionships.findCurrentReign.mockResolvedValue(currentReign);

    const r = await deleteMatch(ev(), ctx, cb);

    expect(r!.statusCode).toBe(200);
    expect(tx.incrementPlayerRecord).toHaveBeenCalledWith('p1', { draws: -1 });
    expect(mockChampionships.listHistory).not.toHaveBeenCalled();
    expect(mockChampionships.decrementDefenses).not.toHaveBeenCalled();
  });
});

// ---- Missing players and seasons -------------------------------------------

describe('deleteMatch — stale references', () => {
  it('still deletes a completed match whose participant was deleted', async () => {
    const tx = captureTx();
    mockMatches.findByIdWithDate.mockResolvedValue({ ...completed, seasonId: 's1' });
    mockPlayers.findById.mockImplementation(async (playerId: string) =>
      playerId === 'p2' ? null : { playerId });

    const r = await deleteMatch(ev(), ctx, cb);

    expect(r!.statusCode).toBe(200);
    expect(tx.incrementPlayerRecord).toHaveBeenCalledTimes(1);
    expect(tx.incrementPlayerRecord).toHaveBeenCalledWith('p1', { wins: -1 });
    expect(tx.incrementStanding).toHaveBeenCalledTimes(1);
    expect(tx.incrementStanding).toHaveBeenCalledWith('s1', 'p1', { wins: -1 });
    expect(mockMatches.delete).toHaveBeenCalled();
  });

  it('does not write standings for a season that no longer exists', async () => {
    const tx = captureTx();
    mockMatches.findByIdWithDate.mockResolvedValue({ ...completed, seasonId: 's1' });
    mockSeasons.findById.mockResolvedValue(null);

    const r = await deleteMatch(ev(), ctx, cb);

    expect(r!.statusCode).toBe(200);
    expect(tx.incrementPlayerRecord).toHaveBeenCalledTimes(2);
    expect(tx.incrementStanding).not.toHaveBeenCalled();
  });

  it('does not touch records when the match was never completed', async () => {
    mockMatches.findByIdWithDate.mockResolvedValue({ ...completed, status: 'scheduled' });

    const r = await deleteMatch(ev(), ctx, cb);

    expect(r!.statusCode).toBe(200);
    expect(mockRunInTransaction).not.toHaveBeenCalled();
    expect(mockMatches.delete).toHaveBeenCalled();
  });
});

// ---- Tournament rollback ---------------------------------------------------

describe('deleteMatch — event status', () => {
  const eventMatch = { ...completed, eventId: 'e1' };
  const statusAfterDeleting = async (matchIds: string[], statuses: Record<string, string>) => {
    captureTx();
    mockMatches.findByIdWithDate.mockResolvedValue(eventMatch);
    mockEvents.findById.mockResolvedValue({
      eventId: 'e1',
      status: 'completed',
      matchCards: matchIds.map((matchId) => ({ matchId })),
    });
    mockMatches.findById.mockImplementation(async (matchId: string) => (
      statuses[matchId] ? { matchId, status: statuses[matchId] } : null
    ));

    await deleteMatch(ev(), ctx, cb);

    return mockEvents.update.mock.calls
      .map(([, patch]) => (patch as { status?: string }).status)
      .find((status) => status !== undefined);
  };

  it('keeps an event completed when every remaining match is finished', async () => {
    const status = await statusAfterDeleting(['m1', 'm2', 'm3'], { m1: 'completed', m2: 'completed', m3: 'completed' });

    expect(status).toBeUndefined();
  });

  it('reopens an event with a match still to play', async () => {
    const status = await statusAfterDeleting(['m1', 'm2', 'm3'], { m1: 'completed', m2: 'completed', m3: 'scheduled' });

    expect(status).toBe('in-progress');
  });

  it('returns a one-match event to upcoming', async () => {
    expect(await statusAfterDeleting(['m1'], { m1: 'completed' })).toBe('upcoming');
  });

  it('ignores a card whose match is already gone', async () => {
    const status = await statusAfterDeleting(['m1', 'gone', 'm3'], { m1: 'completed', m3: 'completed' });

    expect(status).toBeUndefined();
  });
});

describe('deleteMatch — tournament rollback', () => {
  const tournamentMatch = { ...completed, tournamentId: 't1' };

  it('returns 409 and writes nothing when the next round was already played', async () => {
    mockMatches.findByIdWithDate.mockResolvedValue(tournamentMatch);
    mockTournaments.findById.mockResolvedValue({
      tournamentId: 't1',
      type: 'single-elimination',
      status: 'in-progress',
      brackets: {
        rounds: [
          { matches: [{ participant1: 'p1', participant2: 'p2', winner: 'p1', matchId: 'm1' }] },
          { matches: [{ participant1: 'p1', participant2: 'p3', winner: 'p3', matchId: 'm2' }] },
        ],
      },
    });

    const r = await deleteMatch(ev(), ctx, cb);

    expect(r!.statusCode).toBe(409);
    expectNothingWritten();
  });

  it('clears the advancement when the next round is still unplayed', async () => {
    captureTx();
    mockMatches.findByIdWithDate.mockResolvedValue(tournamentMatch);
    mockTournaments.findById.mockResolvedValue({
      tournamentId: 't1',
      type: 'single-elimination',
      status: 'in-progress',
      brackets: {
        rounds: [
          { matches: [{ participant1: 'p1', participant2: 'p2', winner: 'p1', matchId: 'm1' }] },
          { matches: [{ participant1: 'p1', participant2: 'p3' }] },
        ],
      },
    });

    const r = await deleteMatch(ev(), ctx, cb);

    expect(r!.statusCode).toBe(200);
    expect(mockTournaments.update).toHaveBeenCalledWith('t1', {
      status: 'in-progress',
      brackets: {
        rounds: [
          { matches: [{ participant1: 'p1', participant2: 'p2' }] },
          { matches: [{ participant2: 'p3' }] },
        ],
      },
    });
    expect(mockTournaments.removeWinner).not.toHaveBeenCalled();
  });

  it('reopens a finished bracket and clears its winner when the final is deleted', async () => {
    captureTx();
    mockMatches.findByIdWithDate.mockResolvedValue(tournamentMatch);
    mockTournaments.findById.mockResolvedValue({
      tournamentId: 't1',
      type: 'single-elimination',
      status: 'completed',
      winner: 'p1',
      brackets: {
        rounds: [{ matches: [{ participant1: 'p1', participant2: 'p2', winner: 'p1', matchId: 'm1' }] }],
      },
    });

    const r = await deleteMatch(ev(), ctx, cb);

    expect(r!.statusCode).toBe(200);
    expect(mockTournaments.update).toHaveBeenCalledWith('t1', expect.objectContaining({ status: 'in-progress' }));
    expect(mockTournaments.removeWinner).toHaveBeenCalledWith('t1');
  });

  it('reopens a finished round-robin and clears its winner', async () => {
    captureTx();
    mockMatches.findByIdWithDate.mockResolvedValue(tournamentMatch);
    mockTournaments.findById.mockResolvedValue({
      tournamentId: 't1',
      type: 'round-robin',
      status: 'completed',
      winner: 'p1',
      standings: {
        p1: { wins: 1, losses: 0, draws: 0, points: 2 },
        p2: { wins: 0, losses: 1, draws: 0, points: 0 },
      },
    });

    const r = await deleteMatch(ev(), ctx, cb);

    expect(r!.statusCode).toBe(200);
    expect(mockTournaments.update).toHaveBeenCalledWith('t1', {
      status: 'in-progress',
      standings: {
        p1: { wins: 0, losses: 0, draws: 0, points: 0 },
        p2: { wins: 0, losses: 0, draws: 0, points: 0 },
      },
    });
    expect(mockTournaments.removeWinner).toHaveBeenCalledWith('t1');
  });
});
