import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const {
  mockMatchesListCompleted,
  mockChampionshipsListAllHistory,
  mockChampionshipsList,
  mockSeasonsList,
  mockTournamentsList,
  mockChallengesList,
  mockPromosList,
  mockPlayersList,
  mockListTracks,
  mockListByTrack,
} = vi.hoisted(() => ({
  mockMatchesListCompleted: vi.fn(),
  mockChampionshipsListAllHistory: vi.fn(),
  mockChampionshipsList: vi.fn(),
  mockSeasonsList: vi.fn(),
  mockTournamentsList: vi.fn(),
  mockChallengesList: vi.fn(),
  mockPromosList: vi.fn(),
  mockPlayersList: vi.fn(),
  mockListTracks: vi.fn(),
  mockListByTrack: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    competition: {
      matches: { listCompleted: mockMatchesListCompleted },
      championships: { listAllHistory: mockChampionshipsListAllHistory, list: mockChampionshipsList },
      tournaments: { list: mockTournamentsList },
    },
    season: {
      seasons: { list: mockSeasonsList },
    },
    user: {
      challenges: { list: mockChallengesList },
    },
    content: {
      promos: { list: mockPromosList },
    },
    roster: {
      players: { listWithDeleted: mockPlayersList },
    },
    progression: { listTracks: mockListTracks, listByTrack: mockListByTrack },
  }),
}));

import { handler as getActivity } from '../getActivity';

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/activity',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: { authorizer: {} } as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

function mockAllEmpty() {
  mockMatchesListCompleted.mockResolvedValue([]);
  mockChampionshipsListAllHistory.mockResolvedValue([]);
  mockChampionshipsList.mockResolvedValue([]);
  mockSeasonsList.mockResolvedValue([]);
  mockTournamentsList.mockResolvedValue([]);
  mockChallengesList.mockResolvedValue([]);
  mockPromosList.mockResolvedValue([]);
  mockPlayersList.mockResolvedValue([]);
  mockListTracks.mockResolvedValue([]);
  mockListByTrack.mockResolvedValue([]);
}

describe('getActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAllEmpty();
  });

  it('returns empty items and null nextCursor when no data', async () => {
    const result = await getActivity(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it('returns merged and sorted activity items', async () => {
    mockMatchesListCompleted.mockResolvedValue([
      {
        matchId: 'm1',
        date: '2024-02-01T12:00:00.000Z',
        updatedAt: '2024-02-01T14:00:00.000Z',
        status: 'completed',
        participants: ['p1', 'p2'],
        winners: ['p1'],
        losers: ['p2'],
        matchFormat: 'singles',
      },
    ]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Test Player', currentWrestler: 'Wrestler' },
      { playerId: 'p2', name: 'Test Player', currentWrestler: 'Wrestler2' },
    ]);

    const result = await getActivity(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].type).toBe('match_result');
    expect(body.items[0].timestamp).toBe('2024-02-01T12:00:00.000Z');
    expect(body.items[0].id).toBe('match-m1');
    expect(body.items[0].summary).toBe('Test Player def. Test Player');
    expect(body.nextCursor).toBeNull();
  });

  it('keeps a rated old match in date order rather than as a fresh result', async () => {
    const match = { status: 'completed', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] };
    mockMatchesListCompleted.mockResolvedValue([
      { ...match, matchId: 'old', date: '2024-01-01T12:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' },
      { ...match, matchId: 'new', date: '2024-02-01T12:00:00.000Z', updatedAt: '2024-02-01T14:00:00.000Z' },
    ]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'A', currentWrestler: 'Wrestler' },
      { playerId: 'p2', name: 'B', currentWrestler: 'Wrestler2' },
    ]);

    const result = await getActivity(makeEvent(), ctx, cb);

    const { items } = JSON.parse(result!.body);
    expect(items.map((item: { id: string }) => item.id)).toEqual(['match-new', 'match-old']);
  });

  it('reports a stored draw rather than a vague completed match', async () => {
    mockMatchesListCompleted.mockResolvedValue([{
      matchId: 'm1',
      date: '2024-02-01T12:00:00.000Z',
      updatedAt: '2024-02-01T14:00:00.000Z',
      status: 'completed',
      participants: ['p1', 'p2'],
      winners: ['p1', 'p2'],
      losers: [],
      isDraw: true,
    }]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'Wrestler' },
      { playerId: 'p2', name: 'Bob', currentWrestler: 'Wrestler2' },
    ]);

    const result = await getActivity(makeEvent(), ctx, cb);

    expect(JSON.parse(result!.body).items[0].summary).toBe('Alice & Bob drew');
  });

  it('excludes matches without updatedAt from activity', async () => {
    mockMatchesListCompleted.mockResolvedValue([
      {
        matchId: 'm1',
        date: '2024-02-01T12:00:00.000Z',
        updatedAt: '2024-02-01T14:00:00.000Z',
        status: 'completed',
        participants: ['p1', 'p2'],
        winners: ['p1'],
        losers: ['p2'],
        matchFormat: 'singles',
      },
      {
        matchId: 'm2',
        date: '2024-02-02T12:00:00.000Z',
        status: 'completed',
        participants: ['p1', 'p2'],
        winners: ['p2'],
        losers: ['p1'],
        matchFormat: 'singles',
      },
    ]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Test Player', currentWrestler: 'Wrestler' },
      { playerId: 'p2', name: 'Test Player', currentWrestler: 'Wrestler2' },
    ]);

    const result = await getActivity(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].metadata.matchId).toBe('m1');
  });

  it('respects limit param', async () => {
    const match = {
      matchId: 'm1',
      date: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      status: 'completed',
      participants: ['p1', 'p2'],
      winners: ['p1'],
      losers: ['p2'],
      matchFormat: 'singles',
    };
    mockMatchesListCompleted.mockResolvedValue([
      match,
      { ...match, matchId: 'm2', date: '2024-01-02T00:00:00.000Z', updatedAt: '2024-01-02T00:00:00.000Z' },
      { ...match, matchId: 'm3', date: '2024-01-03T00:00:00.000Z', updatedAt: '2024-01-03T00:00:00.000Z' },
    ]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Test Player', currentWrestler: 'Wrestler' },
      { playerId: 'p2', name: 'Test Player', currentWrestler: 'Wrestler2' },
    ]);

    const result = await getActivity(
      makeEvent({ queryStringParameters: { limit: '2' } }),
      ctx,
      cb
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.items).toHaveLength(2);
    expect(body.nextCursor).toBe(`${body.items[1].timestamp}|${body.items[1].id}`);
  });

  it('applies cursor-based pagination', async () => {
    const match = {
      matchId: 'm1',
      date: '2024-01-01T00:00:00.000Z',
      status: 'completed',
      participants: ['p1', 'p2'],
      winners: ['p1'],
      losers: ['p2'],
      matchFormat: 'singles',
    };
    mockMatchesListCompleted.mockResolvedValue([
      { ...match, matchId: 'm3', date: '2024-01-03T00:00:00.000Z', updatedAt: '2024-01-03T00:00:00.000Z' },
      { ...match, matchId: 'm2', date: '2024-01-02T00:00:00.000Z', updatedAt: '2024-01-02T00:00:00.000Z' },
      { ...match, matchId: 'm1', date: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
    ]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Test Player', currentWrestler: 'Wrestler' },
      { playerId: 'p2', name: 'Test Player', currentWrestler: 'Wrestler2' },
    ]);

    const result = await getActivity(
      makeEvent({ queryStringParameters: { limit: '2', cursor: '2024-01-02T12:00:00.000Z' } }),
      ctx,
      cb
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].metadata.matchId).toBe('m2');
    expect(body.items[1].metadata.matchId).toBe('m1');
  });

  it('when type=match only calls match-related repos', async () => {
    await getActivity(
      makeEvent({ queryStringParameters: { type: 'match' } }),
      ctx,
      cb
    );

    expect(mockMatchesListCompleted).toHaveBeenCalledTimes(1);
    expect(mockChampionshipsListAllHistory).not.toHaveBeenCalled();
    expect(mockSeasonsList).not.toHaveBeenCalled();
    expect(mockTournamentsList).not.toHaveBeenCalled();
    expect(mockChallengesList).not.toHaveBeenCalled();
    expect(mockPromosList).not.toHaveBeenCalled();
    expect(mockListTracks).not.toHaveBeenCalled();
  });

  describe('callup_consideration', () => {
    const player = (playerId: string, extra: Record<string, unknown> = {}) => ({
      playerId,
      name: `Name ${playerId}`,
      currentWrestler: `Wrestler ${playerId}`,
      ...extra,
    });

    beforeEach(() => {
      mockListTracks.mockResolvedValue([{ trackId: 't1', kind: 'callup', isActive: true }]);
      mockListByTrack.mockResolvedValue([
        {
          playerId: 'p1',
          trackId: 't1',
          progressPct: 50,
          goals: [],
          computedAt: '2026-11-01T00:00:00.000Z',
          consideration: { status: 'considering', markedBy: 'gm', markedAt: '2026-11-10T00:00:00.000Z' },
        },
        { playerId: 'p2', trackId: 't1', progressPct: 90, goals: [], computedAt: '2026-11-01T00:00:00.000Z' },
      ]);
    });

    it('lists current call-up marks with the player name', async () => {
      mockPlayersList.mockResolvedValue([player('p1'), player('p2')]);

      const result = await getActivity(makeEvent({ queryStringParameters: { type: 'callup' } }), ctx, cb);

      expect(mockListTracks).toHaveBeenCalledWith({ kind: 'callup', isActive: true });
      expect(mockMatchesListCompleted).not.toHaveBeenCalled();
      const body = JSON.parse(result!.body);
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        type: 'callup_consideration',
        timestamp: '2026-11-10T00:00:00.000Z',
        summary: 'Name p1 is being considered for a call-up',
        metadata: { playerId: 'p1', trackId: 't1', playerName: 'Name p1' },
      });
    });

    it('drops marks on hidden, deactivated or deleted players', async () => {
      for (const extra of [
        { currentWrestler: 'Needs Wrestler' },
        { deactivatedAt: '2026-11-11T00:00:00.000Z' },
        { deletedAt: '2026-11-11T00:00:00.000Z' },
      ]) {
        mockPlayersList.mockResolvedValue([player('p1', extra)]);
        const result = await getActivity(makeEvent({ queryStringParameters: { type: 'callup' } }), ctx, cb);
        expect(JSON.parse(result!.body).items).toEqual([]);
      }
    });
  });

  it('returns 500 when a repository method throws', async () => {
    mockMatchesListCompleted.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await getActivity(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch activity');
  });


  describe('ids with no matching row', () => {
    const missingId = '9277aa8e-6517-4362-a95a-749e10615306';
    const stamp = '2024-02-01T14:00:00.000Z';

    async function summaries(): Promise<string[]> {
      const result = await getActivity(makeEvent(), ctx, cb);
      const body = JSON.parse(result!.body) as { items: Array<{ summary: string }> };
      return body.items.map((item) => item.summary);
    }

    it('names deleted players Former member in match results', async () => {
      mockMatchesListCompleted.mockResolvedValue([
        { matchId: 'm1', date: stamp, updatedAt: stamp, status: 'completed', participants: [missingId, 'p2'], winners: [missingId], losers: ['p2'] },
      ]);
      mockPlayersList.mockResolvedValue([{ playerId: 'p2', name: 'Kept', currentWrestler: 'W' }]);

      expect(await summaries()).toEqual(['Former member def. Kept']);
    });

    it('never uses an id in title, tournament, challenge or promo summaries', async () => {
      mockChampionshipsListAllHistory.mockResolvedValue([
        { championshipId: 'gone-title', wonDate: stamp, updatedAt: stamp, champion: missingId },
      ]);
      mockTournamentsList.mockResolvedValue([
        { tournamentId: 't1', name: 'Cup', type: 'single-elimination', status: 'completed', winner: missingId, updatedAt: stamp },
      ]);
      mockChallengesList.mockResolvedValue([
        { challengeId: 'c1', challengerId: missingId, challengedId: missingId, status: 'pending', updatedAt: stamp },
      ]);
      mockPromosList.mockResolvedValue([
        { promoId: 'pr1', playerId: missingId, promoType: 'open', updatedAt: stamp },
      ]);

      const all = await summaries();

      expect(all).toHaveLength(4);
      expect(all.join(' ')).not.toContain(missingId);
      expect(all.join(' ')).not.toContain('gone-title');
      expect(all).toContain('Unknown Championship: Former member crowned');
      expect(all).toContain('Tournament "Cup" completed — Former member won');
    });

    it('falls back to Former member for a player row with no names, never the id', async () => {
      mockMatchesListCompleted.mockResolvedValue([
        { matchId: 'm1', date: stamp, updatedAt: stamp, status: 'completed', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] },
      ]);
      mockPlayersList.mockResolvedValue([
        { playerId: 'p1', name: '', currentWrestler: '' },
        { playerId: 'p2', name: 'Kept', currentWrestler: 'W' },
      ]);

      expect(await summaries()).toEqual(['Former member def. Kept']);
    });
  });
});
