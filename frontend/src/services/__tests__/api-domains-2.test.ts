import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  eventsApi,
  contendersApi,
  usersApi,
  siteConfigApi,
  statisticsApi,
} from '../api';

const API_BASE = 'http://localhost:3001/dev';

// Helper to create a mock Response
function mockResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.setItem('accessToken', 'test-token-123');
  global.fetch = vi.fn();
});

afterEach(() => {
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// eventsApi
// ---------------------------------------------------------------------------
describe('eventsApi', () => {
  it('getAll calls /events with no query params when no filters', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse([]));

    await eventsApi.getAll();

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/events`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token-123' }) }),
    );
  });

  it('getAll appends status, seasonId, and eventType query params', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse([]));

    await eventsApi.getAll({ status: 'upcoming', seasonId: 's1', eventType: 'ppv' });

    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('eventType=ppv');
    expect(calledUrl).toContain('status=upcoming');
    expect(calledUrl).toContain('seasonId=s1');
  });

  it('getById calls /events/:id', async () => {
    const event = { eventId: 'e1', name: 'WrestleMania' };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse(event));

    const result = await eventsApi.getById('e1');

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/events/e1`,
      expect.any(Object),
    );
    expect(result).toEqual(event);
  });

  it('create sends POST with event body', async () => {
    const input = { name: 'Royal Rumble', eventType: 'ppv', date: '2024-01-28' };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({ eventId: 'e2', ...input }));

    await eventsApi.create(input as any);

    const [, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual(input);
  });

  it('update sends PUT to /events/:id and delete sends DELETE', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockResponse({ eventId: 'e1' }))
      .mockResolvedValueOnce(mockResponse(undefined, 204));

    await eventsApi.update('e1', { name: 'Updated' } as any);
    await eventsApi.delete('e1');

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].method).toBe('PUT');
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][0]).toBe(`${API_BASE}/events/e1`);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].method).toBe('DELETE');
  });
});

// ---------------------------------------------------------------------------
// contendersApi
// ---------------------------------------------------------------------------
describe('contendersApi', () => {
  it('getForChampionship calls /championships/:id/contenders', async () => {
    const data = { championshipId: 'c1', contenders: [] };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse(data));

    const result = await contendersApi.getForChampionship('c1');

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/championships/c1/contenders`,
      expect.any(Object),
    );
    expect(result).toEqual(data);
  });

  it('recalculate sends POST to /admin/contenders/recalculate with optional championshipId', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockResponse({ message: 'ok', summary: {} }))
      .mockResolvedValueOnce(mockResponse({ message: 'ok', summary: {} }));

    // Without championshipId
    await contendersApi.recalculate();
    let body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toEqual({});

    // With championshipId
    await contendersApi.recalculate('c1');
    body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body);
    expect(body).toEqual({ championshipId: 'c1' });
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].method).toBe('POST');
  });
});

// ---------------------------------------------------------------------------
// usersApi
// ---------------------------------------------------------------------------
describe('usersApi', () => {
  it('list calls GET /admin/users', async () => {
    const data = { users: [{ username: 'john', sub: 's1', email: 'j@e.com', name: 'John', wrestlerName: '', status: 'CONFIRMED', enabled: true, created: '2024-01-01', groups: [] }] };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse(data));

    const result = await usersApi.list();

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/admin/users`,
      expect.any(Object),
    );
    expect(result.users).toHaveLength(1);
  });

  it('updateRole sends POST to /admin/users/role with username, role, action', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ message: 'ok', username: 'john', groups: ['Wrestler'] }),
    );

    await usersApi.updateRole('john', 'Wrestler', 'promote');

    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`${API_BASE}/admin/users/role`);
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ username: 'john', role: 'Wrestler', action: 'promote' });
  });

  it('toggleEnabled sends POST to /admin/users/toggle-enabled', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ message: 'ok', username: 'john', enabled: false }),
    );

    await usersApi.toggleEnabled('john', false);

    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`${API_BASE}/admin/users/toggle-enabled`);
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ username: 'john', enabled: false });
  });
});

// ---------------------------------------------------------------------------
// siteConfigApi
// ---------------------------------------------------------------------------
describe('siteConfigApi', () => {
  it('getFeatures calls GET /site-config', async () => {
    const data = { features: { fantasy: true, challenges: true, promos: true, contenders: true, statistics: true } };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse(data));

    const result = await siteConfigApi.getFeatures();

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/site-config`,
      expect.any(Object),
    );
    expect(result.features.fantasy).toBe(true);
  });

  it('updateFeatures sends PUT to /admin/site-config with features payload', async () => {
    const updated = { features: { fantasy: false, challenges: true, promos: true, contenders: true, statistics: true } };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse(updated));

    await siteConfigApi.updateFeatures({ fantasy: false });

    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`${API_BASE}/admin/site-config`);
    expect(opts.method).toBe('PUT');
    expect(JSON.parse(opts.body)).toEqual({ features: { fantasy: false } });
  });
});

// ---------------------------------------------------------------------------
// statisticsApi
// ---------------------------------------------------------------------------
describe('statisticsApi', () => {
  it('getPlayerStats includes section=player-stats and optional playerId', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockResponse({ players: [], statistics: [] }))
      .mockResolvedValueOnce(mockResponse({ players: [], statistics: [] }));

    // Without playerId
    await statisticsApi.getPlayerStats();
    let url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('section=player-stats');
    expect(url).not.toContain('playerId');

    // With playerId
    await statisticsApi.getPlayerStats('p1');
    url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][0] as string;
    expect(url).toContain('section=player-stats');
    expect(url).toContain('playerId=p1');
  });

  it('getHeadToHead includes section=head-to-head with both player IDs', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ players: [], headToHead: null, player1Stats: {}, player2Stats: {} }),
    );

    await statisticsApi.getHeadToHead('p1', 'p2');

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('section=head-to-head');
    expect(url).toContain('player1Id=p1');
    expect(url).toContain('player2Id=p2');
  });

  it('getLeaderboards includes section=leaderboards', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ players: [], leaderboards: {} }),
    );

    await statisticsApi.getLeaderboards();

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('section=leaderboards');
  });

  it('getRecords includes section=records', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ records: {}, activeThreats: [] }),
    );

    await statisticsApi.getRecords();

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('section=records');
  });

  it('getAchievements includes section=achievements and optional playerId', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockResponse({ players: [], allAchievements: [] }))
      .mockResolvedValueOnce(mockResponse({ players: [], allAchievements: [], achievements: [] }));

    await statisticsApi.getAchievements();
    let url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('section=achievements');
    expect(url).not.toContain('playerId');

    await statisticsApi.getAchievements('p1');
    url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][0] as string;
    expect(url).toContain('section=achievements');
    expect(url).toContain('playerId=p1');
  });
});
