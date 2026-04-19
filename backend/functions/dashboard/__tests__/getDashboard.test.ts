import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context, Callback } from 'aws-lambda';

const {
  mockChampionshipsList,
  mockPlayersList,
  mockSeasonsList,
  mockMatchesList,
  mockStipulationsList,
  mockEventsListByStatus,
  mockChallengesListByStatus,
  mockChampionshipsFindCurrentReign,
  mockSeasonStandingsListBySeason,
} = vi.hoisted(() => ({
  mockChampionshipsList: vi.fn(),
  mockPlayersList: vi.fn(),
  mockSeasonsList: vi.fn(),
  mockMatchesList: vi.fn(),
  mockStipulationsList: vi.fn(),
  mockEventsListByStatus: vi.fn(),
  mockChallengesListByStatus: vi.fn(),
  mockChampionshipsFindCurrentReign: vi.fn(),
  mockSeasonStandingsListBySeason: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    competition: {
      championships: { list: mockChampionshipsList, findCurrentReign: mockChampionshipsFindCurrentReign },
      matches: { list: mockMatchesList },
      stipulations: { list: mockStipulationsList },
    },
    roster: { players: { list: mockPlayersList } },
    season: {
      seasons: { list: mockSeasonsList },
      seasonStandings: { listBySeason: mockSeasonStandingsListBySeason },
    },
    leagueOps: { events: { listByStatus: mockEventsListByStatus } },
    user: { challenges: { listByStatus: mockChallengesListByStatus } },
  }),
}));

import { handler as getDashboard } from '../getDashboard';

const ctx = {} as Context;
const cb: Callback = () => {};

describe('getDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChampionshipsList.mockResolvedValue([]);
    mockPlayersList.mockResolvedValue([]);
    mockSeasonsList.mockResolvedValue([]);
    mockMatchesList.mockResolvedValue([]);
    mockStipulationsList.mockResolvedValue([]);
    mockEventsListByStatus.mockResolvedValue([]);
    mockChallengesListByStatus.mockResolvedValue([]);
    mockChampionshipsFindCurrentReign.mockResolvedValue(null);
    mockSeasonStandingsListBySeason.mockResolvedValue([]);
  });

  it('returns 200 with all dashboard sections', async () => {
    const result = await getDashboard({} as never, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveProperty('currentChampions');
    expect(body).toHaveProperty('upcomingEvents');
    expect(body).toHaveProperty('inProgressEvents');
    expect(body).toHaveProperty('recentResults');
    expect(body).toHaveProperty('seasonInfo');
    expect(body).toHaveProperty('quickStats');
    expect(body).toHaveProperty('activeChallengesCount');
    expect(Array.isArray(body.currentChampions)).toBe(true);
    expect(Array.isArray(body.upcomingEvents)).toBe(true);
    expect(Array.isArray(body.inProgressEvents)).toBe(true);
    expect(Array.isArray(body.recentResults)).toBe(true);
    expect(body.quickStats).toMatchObject({
      totalPlayers: 0,
      totalMatches: 0,
      activeChampionships: 0,
    });
    expect(body.activeChallengesCount).toBe(0);
  });

  it('handles empty tables gracefully', async () => {
    const result = await getDashboard({} as never, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.currentChampions).toHaveLength(0);
    expect(body.upcomingEvents).toHaveLength(0);
    expect(body.recentResults).toHaveLength(0);
    expect(body.seasonInfo).toBeNull();
  });

  it('returns correct current champions (only active with champion)', async () => {
    mockChampionshipsList.mockResolvedValue([
      { championshipId: 'c1', name: 'World Title', isActive: true, currentChampion: 'p1' },
      { championshipId: 'c2', name: 'Tag Titles', isActive: false, currentChampion: 'p2' },
      { championshipId: 'c3', name: 'Midcard', isActive: true },
    ]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'Stone Cold' },
    ]);
    mockChampionshipsFindCurrentReign.mockResolvedValue(null);

    const result = await getDashboard({} as never, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.currentChampions).toHaveLength(1);
    expect(body.currentChampions[0].championshipName).toBe('World Title');
    expect(body.currentChampions[0].championName).toBe('Stone Cold');
  });

  it('reads champion wonDate from ChampionshipHistory (open reign), not from Championships.updatedAt', async () => {
    const realWonDate = '2025-11-01T12:00:00Z';
    const bogusUpdatedAt = '2026-04-10T09:00:00Z';

    mockChampionshipsList.mockResolvedValue([
      {
        championshipId: 'c1',
        name: 'World Title',
        isActive: true,
        currentChampion: 'p1',
        updatedAt: bogusUpdatedAt,
      },
    ]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'Stone Cold' },
    ]);
    mockChampionshipsFindCurrentReign.mockResolvedValue({
      championshipId: 'c1',
      wonDate: realWonDate,
      champion: 'p1',
      defenses: 3,
    });

    const result = await getDashboard({} as never, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.currentChampions).toHaveLength(1);
    expect(body.currentChampions[0].wonDate).toBe(realWonDate);
    expect(body.currentChampions[0].wonDate).not.toBe(bogusUpdatedAt);
    expect(body.currentChampions[0].defenses).toBe(3);
  });

  it('falls back to undefined wonDate when ChampionshipHistory has no open reign row', async () => {
    mockChampionshipsList.mockResolvedValue([
      {
        championshipId: 'c1',
        name: 'World Title',
        isActive: true,
        currentChampion: 'p1',
        updatedAt: '2026-04-10T09:00:00Z',
      },
    ]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'Stone Cold' },
    ]);
    mockChampionshipsFindCurrentReign.mockResolvedValue(null);

    const result = await getDashboard({} as never, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.currentChampions).toHaveLength(1);
    expect(body.currentChampions[0].wonDate).toBeUndefined();
  });

  it('limits upcoming events to 3', async () => {
    mockEventsListByStatus.mockImplementation((status: string) => {
      if (status === 'upcoming') {
        return Promise.resolve([
          { eventId: 'e1', name: 'Event 1', date: '2025-03-01', eventType: 'ppv' },
          { eventId: 'e2', name: 'Event 2', date: '2025-03-02', eventType: 'ppv' },
          { eventId: 'e3', name: 'Event 3', date: '2025-03-03', eventType: 'ppv' },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await getDashboard({} as never, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.upcomingEvents.length).toBeLessThanOrEqual(3);
  });

  it('excludes completed matches without updatedAt from recent results', async () => {
    mockMatchesList.mockResolvedValue([
      {
        matchId: 'm1',
        date: '2025-01-10T00:00:00Z',
        status: 'completed',
        winners: ['p1'],
        losers: ['p2'],
        matchFormat: 'singles',
      },
    ]);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', currentWrestler: 'A' },
      { playerId: 'p2', currentWrestler: 'B' },
    ]);

    const result = await getDashboard({} as never, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.recentResults).toHaveLength(0);
  });

  it('returns recent results from the last 3 days, excluding older matches', async () => {
    const now = Date.now();
    const oneHourMs = 60 * 60 * 1000;
    // 5 recent matches (within 3 days) + 5 old matches (> 3 days ago)
    const manyMatches = [
      ...Array.from({ length: 5 }, (_, i) => ({
        matchId: `recent${i}`,
        date: new Date(now - (i + 1) * oneHourMs).toISOString(),
        updatedAt: new Date(now - (i + 1) * oneHourMs).toISOString(),
        status: 'completed',
        winners: ['p1'],
        losers: ['p2'],
        matchFormat: 'singles',
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        matchId: `old${i}`,
        date: new Date(now - (10 + i) * 24 * oneHourMs).toISOString(),
        updatedAt: new Date(now - (10 + i) * 24 * oneHourMs).toISOString(),
        status: 'completed',
        winners: ['p1'],
        losers: ['p2'],
        matchFormat: 'singles',
      })),
    ];
    mockMatchesList.mockResolvedValue(manyMatches);
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', currentWrestler: 'A' },
      { playerId: 'p2', currentWrestler: 'B' },
    ]);

    const result = await getDashboard({} as never, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.recentResults).toHaveLength(5);
    expect(body.recentResults.every((m: { matchId: string }) => m.matchId.startsWith('recent'))).toBe(true);
  });

  it('returns 500 on repository error', async () => {
    mockChampionshipsList.mockRejectedValue(new Error('DynamoDB connection failed'));

    const result = await getDashboard({} as never, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to load dashboard data');
  });
});
