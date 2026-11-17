import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context, Callback } from 'aws-lambda';

const mocks = vi.hoisted(() => ({
  playersList: vi.fn(),
  championshipsList: vi.fn(),
  listAllHistory: vi.fn(),
  eventsListByStatus: vi.fn(),
  matchesFindById: vi.fn(),
  rivalriesListByStatus: vi.fn(),
  announcementsListActive: vi.fn(),
  listTracks: vi.fn(),
  listByTrack: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    competition: {
      championships: { list: mocks.championshipsList, listAllHistory: mocks.listAllHistory },
      matches: { findById: mocks.matchesFindById },
    },
    roster: { players: { listWithDeleted: mocks.playersList } },
    leagueOps: { events: { listByStatus: mocks.eventsListByStatus } },
    content: { announcements: { listActive: mocks.announcementsListActive } },
    rivalries: { listByStatus: mocks.rivalriesListByStatus },
    progression: { listTracks: mocks.listTracks, listByTrack: mocks.listByTrack },
  }),
}));

import { handler as getTicker, TICKER_CACHE_SECONDS } from '../getTicker';
import { handler as dashboardRouter } from '../handler';

const ctx = {} as Context;
const cb: Callback = () => {};

async function callTicker(): Promise<APIGatewayProxyResult> {
  return (await getTicker({} as APIGatewayProxyEvent, ctx, cb)) as APIGatewayProxyResult;
}

describe('getTicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T18:00:00.000Z'));
    mocks.playersList.mockResolvedValue([]);
    mocks.championshipsList.mockResolvedValue([]);
    mocks.listAllHistory.mockResolvedValue([]);
    mocks.eventsListByStatus.mockResolvedValue([]);
    mocks.matchesFindById.mockResolvedValue(null);
    mocks.rivalriesListByStatus.mockResolvedValue({ items: [] });
    mocks.announcementsListActive.mockResolvedValue([]);
    mocks.listTracks.mockResolvedValue([]);
    mocks.listByTrack.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns no segments for an empty league, with cache headers', async () => {
    const result = await callTicker();
    expect(result.statusCode).toBe(200);
    expect(result.headers?.['Cache-Control']).toBe(`public, max-age=${TICKER_CACHE_SECONDS}`);
    expect(JSON.parse(result.body)).toEqual({ segments: [], generatedAt: '2026-11-16T18:00:00.000Z' });
  });

  it('builds segments from league data, in priority order', async () => {
    mocks.playersList.mockResolvedValue([
      { playerId: 'p1', name: 'Pat', currentWrestler: 'Cena' },
      { playerId: 'p2', name: 'Sam', currentWrestler: 'Rock' },
      { playerId: 'hidden', name: 'Hid', currentWrestler: '' },
    ]);
    mocks.championshipsList.mockResolvedValue([
      { championshipId: 'c1', name: 'World', type: 'singles', currentChampion: 'p1' },
    ]);
    mocks.listAllHistory.mockResolvedValue([
      { championshipId: 'c1', wonDate: '2026-11-14T00:00:00.000Z', champion: 'p1' },
    ]);
    mocks.eventsListByStatus.mockImplementation(async (status: string) => {
      if (status === 'upcoming') return [{ eventId: 'e1', name: 'Raw', eventType: 'weekly', date: '2026-11-16', status: 'upcoming', matchCards: [] }];
      if (status === 'completed') {
        return [{
          eventId: 'e0', name: 'Mania', eventType: 'ppv', date: '2026-11-10', status: 'completed',
          matchCards: [{ position: 1, matchId: 'm1', designation: 'main-event' }],
        }];
      }
      return [];
    });
    mocks.matchesFindById.mockResolvedValue({
      matchId: 'm1', status: 'completed', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'],
    });
    mocks.rivalriesListByStatus.mockResolvedValue({
      items: [
        { rivalryId: 'r1', title: 'Cena vs Rock', heat: 'hot', status: 'active', participants: [{ playerId: 'p1' }, { playerId: 'p2' }] },
        { rivalryId: 'r2', title: 'Secret feud', heat: 'scorching', status: 'active', participants: [{ playerId: 'hidden' }] },
      ],
    });
    mocks.announcementsListActive.mockResolvedValue([{ announcementId: 'a1', title: 'Big news' }]);
    mocks.listTracks.mockResolvedValue([{ trackId: 't1' }]);
    mocks.listByTrack.mockResolvedValue([
      { playerId: 'p2', trackId: 't1', consideration: { markedAt: '2026-11-15T00:00:00.000Z' } },
      { playerId: 'hidden', trackId: 't1', consideration: { markedAt: '2026-11-14T00:00:00.000Z' } },
    ]);

    const body = JSON.parse((await callTicker()).body);
    const byKey = Object.fromEntries(body.segments.map((segment: { key: string }) => [segment.key, segment]));

    expect(body.segments.map((segment: { key: string }) => segment.key)).toEqual([
      'tonight', 'newChampions', 'potentialCallups', 'hotRivalries', 'news', 'champions', 'latestResults',
    ]);
    expect(mocks.listTracks).toHaveBeenCalledWith({ kind: 'callup', isActive: true });
    expect(byKey.potentialCallups.items).toEqual([{ text: 'Rock', href: '/player/p2' }]);
    expect(byKey.hotRivalries.items).toEqual([{ text: 'Cena vs Rock', href: '/rivalries/r1' }]);
    expect(byKey.newChampions.items[0].text).toBe('Cena · World');
    expect(byKey.latestResults.items.map((item: { text: string }) => item.text)).toEqual(['Mania', 'Cena def. Rock']);
  });

  it('still answers when one source fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.rivalriesListByStatus.mockRejectedValue(new Error('boom'));
    mocks.announcementsListActive.mockResolvedValue([{ announcementId: 'a1', title: 'Big news' }]);

    const result = await callTicker();
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).segments.map((segment: { key: string }) => segment.key)).toEqual(['news']);
  });

  it('is routed at GET /ticker on the dashboard Lambda', async () => {
    const event = {
      httpMethod: 'GET', resource: '/ticker', path: '/ticker', headers: {}, requestContext: {},
    } as unknown as APIGatewayProxyEvent;
    const result = (await dashboardRouter(event, ctx, cb)) as APIGatewayProxyResult;
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toHaveProperty('segments');
  });
});
