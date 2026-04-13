import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context, Callback } from 'aws-lambda';

const { mockScanAll, mockQuery, mockQueryAll } = vi.hoisted(() => ({
  mockScanAll: vi.fn(),
  mockQuery: vi.fn(),
  mockQueryAll: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    scanAll: mockScanAll,
    query: mockQuery,
    queryAll: mockQueryAll,
  },
  TableNames: {
    CHAMPIONSHIPS: 'Championships',
    CHAMPIONSHIP_HISTORY: 'ChampionshipHistory',
    PLAYERS: 'Players',
    SEASONS: 'Seasons',
    MATCHES: 'Matches',
    STIPULATIONS: 'Stipulations',
    EVENTS: 'Events',
    CHALLENGES: 'Challenges',
    SEASON_STANDINGS: 'SeasonStandings',
  },
}));

import { handler as getDashboard } from '../getDashboard';

const ctx = {} as Context;
const cb: Callback = () => {};

describe('getDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScanAll
      .mockResolvedValueOnce([]) // championships
      .mockResolvedValueOnce([]) // players
      .mockResolvedValueOnce([]) // seasons
      .mockResolvedValueOnce([]) // matches
      .mockResolvedValueOnce([]); // stipulations
    mockQuery.mockResolvedValue({ Items: [] });
    mockQueryAll.mockResolvedValue([]);
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
    mockScanAll
      .mockReset()
      .mockResolvedValueOnce([
        { championshipId: 'c1', name: 'World Title', isActive: true, currentChampion: 'p1' },
        { championshipId: 'c2', name: 'Tag Titles', isActive: false, currentChampion: 'p2' },
        { championshipId: 'c3', name: 'Midcard', isActive: true },
      ])
      .mockResolvedValueOnce([
        { playerId: 'p1', name: 'Alice', currentWrestler: 'Stone Cold' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]); // stipulations
    mockQuery.mockReset().mockResolvedValue({ Items: [] });
    mockQueryAll.mockReset().mockResolvedValue([]);

    const result = await getDashboard({} as never, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.currentChampions).toHaveLength(1);
    expect(body.currentChampions[0].championshipName).toBe('World Title');
    expect(body.currentChampions[0].championName).toBe('Stone Cold');
  });

  it('reads champion wonDate from ChampionshipHistory (open reign), not from Championships.updatedAt', async () => {
    // Championship.updatedAt was bumped by a recent image upload and is NOT
    // the real won date. The real won date lives on the open reign row in
    // ChampionshipHistory (the row with no lostDate).
    const realWonDate = '2025-11-01T12:00:00Z';
    const bogusUpdatedAt = '2026-04-10T09:00:00Z';

    mockScanAll
      .mockReset()
      .mockResolvedValueOnce([
        {
          championshipId: 'c1',
          name: 'World Title',
          isActive: true,
          currentChampion: 'p1',
          updatedAt: bogusUpdatedAt,
        },
      ])
      .mockResolvedValueOnce([
        { playerId: 'p1', name: 'Alice', currentWrestler: 'Stone Cold' },
      ])
      .mockResolvedValueOnce([]) // seasons
      .mockResolvedValueOnce([]) // matches
      .mockResolvedValueOnce([]); // stipulations

    mockQuery.mockReset().mockImplementation((params: { TableName: string }) => {
      if (params.TableName === 'ChampionshipHistory') {
        return Promise.resolve({
          Items: [
            {
              championshipId: 'c1',
              wonDate: realWonDate,
              champion: 'p1',
              defenses: 3,
            },
          ],
        });
      }
      return Promise.resolve({ Items: [] });
    });
    mockQueryAll.mockReset().mockResolvedValue([]);

    const result = await getDashboard({} as never, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.currentChampions).toHaveLength(1);
    expect(body.currentChampions[0].wonDate).toBe(realWonDate);
    expect(body.currentChampions[0].wonDate).not.toBe(bogusUpdatedAt);
    expect(body.currentChampions[0].defenses).toBe(3);
  });

  it('falls back to undefined wonDate when ChampionshipHistory has no open reign row', async () => {
    mockScanAll
      .mockReset()
      .mockResolvedValueOnce([
        {
          championshipId: 'c1',
          name: 'World Title',
          isActive: true,
          currentChampion: 'p1',
          updatedAt: '2026-04-10T09:00:00Z',
        },
      ])
      .mockResolvedValueOnce([
        { playerId: 'p1', name: 'Alice', currentWrestler: 'Stone Cold' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockQuery.mockReset().mockResolvedValue({ Items: [] });
    mockQueryAll.mockReset().mockResolvedValue([]);

    const result = await getDashboard({} as never, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.currentChampions).toHaveLength(1);
    expect(body.currentChampions[0].wonDate).toBeUndefined();
  });

  it('limits upcoming events to 3', async () => {
    vi.clearAllMocks();
    mockScanAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]); // stipulations
    mockQuery.mockResolvedValue({
      Items: [
        { eventId: 'e1', name: 'Event 1', date: '2025-03-01', eventType: 'ppv' },
        { eventId: 'e2', name: 'Event 2', date: '2025-03-02', eventType: 'ppv' },
        { eventId: 'e3', name: 'Event 3', date: '2025-03-03', eventType: 'ppv' },
      ],
    });
    mockQueryAll.mockResolvedValue([]);

    const result = await getDashboard({} as never, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.upcomingEvents.length).toBeLessThanOrEqual(3);
  });

  it('excludes completed matches without updatedAt from recent results', async () => {
    const completedNoUpdatedAt = [
      {
        matchId: 'm1',
        date: '2025-01-10T00:00:00Z',
        status: 'completed',
        winners: ['p1'],
        losers: ['p2'],
        matchFormat: 'singles',
      },
    ];
    mockScanAll
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ playerId: 'p1', currentWrestler: 'A' }, { playerId: 'p2', currentWrestler: 'B' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(completedNoUpdatedAt)
      .mockResolvedValueOnce([]);
    mockQuery.mockReset().mockResolvedValue({ Items: [] });
    mockQueryAll.mockReset().mockResolvedValue([]);

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
    mockScanAll
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ playerId: 'p1', currentWrestler: 'A' }, { playerId: 'p2', currentWrestler: 'B' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(manyMatches)
      .mockResolvedValueOnce([]); // stipulations
    mockQuery.mockReset().mockResolvedValue({ Items: [] });
    mockQueryAll.mockReset().mockResolvedValue([]);

    const result = await getDashboard({} as never, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.recentResults).toHaveLength(5);
    expect(body.recentResults.every((m: { matchId: string }) => m.matchId.startsWith('recent'))).toBe(true);
  });

  it('returns 500 on DynamoDB error', async () => {
    mockScanAll.mockReset().mockRejectedValue(new Error('DynamoDB connection failed'));
    mockQuery.mockReset().mockResolvedValue({ Items: [] });
    mockQueryAll.mockReset().mockResolvedValue([]);

    const result = await getDashboard({} as never, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to load dashboard data');
  });
});
