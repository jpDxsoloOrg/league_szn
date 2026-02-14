/**
 * Tests for domain API objects (Part 1):
 * playersApi, matchesApi, championshipsApi, tournamentsApi,
 * standingsApi, seasonsApi, divisionsApi
 *
 * Each test verifies correct URL, HTTP method, request body,
 * and signal passthrough via the mocked global.fetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  playersApi,
  matchesApi,
  championshipsApi,
  tournamentsApi,
  standingsApi,
  seasonsApi,
  divisionsApi,
} from '../api';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(body: unknown = {}, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  });
}

function fetchCallUrl(): string {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
}

function fetchCallOptions(): RequestInit {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  mockFetch();
});

// ===========================================================================
// playersApi
// ===========================================================================

describe('playersApi', () => {
  it('getAll calls GET /players', async () => {
    const players = [{ playerId: 'p1' }];
    mockFetch(players);

    const result = await playersApi.getAll();

    expect(fetchCallUrl()).toBe(`${API_BASE}/players`);
    expect(fetchCallOptions().method).toBeUndefined(); // default GET
    expect(result).toEqual(players);
  });

  it('create calls POST /players with body', async () => {
    const newPlayer = { name: 'John Cena', currentWrestler: 'John Cena' };
    mockFetch({ playerId: 'p-new', ...newPlayer });

    await playersApi.create(newPlayer as never);

    expect(fetchCallUrl()).toBe(`${API_BASE}/players`);
    expect(fetchCallOptions().method).toBe('POST');
    expect(fetchCallOptions().body).toBe(JSON.stringify(newPlayer));
  });

  it('update calls PUT /players/:id with body', async () => {
    const updates = { name: 'Updated Name' };
    mockFetch({ playerId: 'p1', ...updates });

    await playersApi.update('p1', updates);

    expect(fetchCallUrl()).toBe(`${API_BASE}/players/p1`);
    expect(fetchCallOptions().method).toBe('PUT');
    expect(fetchCallOptions().body).toBe(JSON.stringify(updates));
  });

  it('delete calls DELETE /players/:id', async () => {
    mockFetch(undefined, 204);

    await playersApi.delete('p1');

    expect(fetchCallUrl()).toBe(`${API_BASE}/players/p1`);
    expect(fetchCallOptions().method).toBe('DELETE');
  });
});

// ===========================================================================
// matchesApi
// ===========================================================================

describe('matchesApi', () => {
  it('getAll calls GET /matches without query when no filters', async () => {
    mockFetch([]);

    await matchesApi.getAll();

    expect(fetchCallUrl()).toBe(`${API_BASE}/matches`);
  });

  it('getAll appends status filter as query parameter', async () => {
    mockFetch([]);

    await matchesApi.getAll({ status: 'scheduled' });

    expect(fetchCallUrl()).toBe(`${API_BASE}/matches?status=scheduled`);
  });

  it('schedule calls POST /matches with body', async () => {
    const match = {
      matchFormat: 'singles',
      participants: ['p1', 'p2'],
      status: 'scheduled',
    };
    mockFetch({ matchId: 'm1', ...match });

    await matchesApi.schedule(match as never);

    expect(fetchCallUrl()).toBe(`${API_BASE}/matches`);
    expect(fetchCallOptions().method).toBe('POST');
    expect(fetchCallOptions().body).toBe(JSON.stringify(match));
  });

  it('recordResult calls PUT /matches/:id/result with body', async () => {
    const result = { winners: ['p1'], losers: ['p2'] };
    mockFetch({ matchId: 'm1', status: 'completed' });

    await matchesApi.recordResult('m1', result);

    expect(fetchCallUrl()).toBe(`${API_BASE}/matches/m1/result`);
    expect(fetchCallOptions().method).toBe('PUT');
    expect(fetchCallOptions().body).toBe(JSON.stringify(result));
  });
});

// ===========================================================================
// championshipsApi
// ===========================================================================

describe('championshipsApi', () => {
  it('getAll calls GET /championships', async () => {
    mockFetch([]);
    await championshipsApi.getAll();
    expect(fetchCallUrl()).toBe(`${API_BASE}/championships`);
  });

  it('create calls POST /championships with body', async () => {
    const championship = { name: 'World Title', type: 'singles' };
    mockFetch({ championshipId: 'c1', ...championship });

    await championshipsApi.create(championship as never);

    expect(fetchCallUrl()).toBe(`${API_BASE}/championships`);
    expect(fetchCallOptions().method).toBe('POST');
    expect(fetchCallOptions().body).toBe(JSON.stringify(championship));
  });

  it('getHistory calls GET /championships/:id/history', async () => {
    mockFetch([]);
    await championshipsApi.getHistory('c1');
    expect(fetchCallUrl()).toBe(`${API_BASE}/championships/c1/history`);
  });

  it('update calls PUT /championships/:id with body', async () => {
    const updates = { name: 'Renamed Title' };
    mockFetch({ championshipId: 'c1', ...updates });

    await championshipsApi.update('c1', updates);

    expect(fetchCallUrl()).toBe(`${API_BASE}/championships/c1`);
    expect(fetchCallOptions().method).toBe('PUT');
    expect(fetchCallOptions().body).toBe(JSON.stringify(updates));
  });

  it('delete calls DELETE /championships/:id', async () => {
    mockFetch(undefined, 204);
    await championshipsApi.delete('c1');
    expect(fetchCallUrl()).toBe(`${API_BASE}/championships/c1`);
    expect(fetchCallOptions().method).toBe('DELETE');
  });

  it('vacate calls POST /championships/:id/vacate', async () => {
    mockFetch({ championshipId: 'c1', currentChampion: null });

    await championshipsApi.vacate('c1');

    expect(fetchCallUrl()).toBe(`${API_BASE}/championships/c1/vacate`);
    expect(fetchCallOptions().method).toBe('POST');
  });
});

// ===========================================================================
// tournamentsApi
// ===========================================================================

describe('tournamentsApi', () => {
  it('getAll calls GET /tournaments', async () => {
    mockFetch([]);
    await tournamentsApi.getAll();
    expect(fetchCallUrl()).toBe(`${API_BASE}/tournaments`);
  });

  it('getById calls GET /tournaments/:id', async () => {
    mockFetch({ tournamentId: 't1' });
    await tournamentsApi.getById('t1');
    expect(fetchCallUrl()).toBe(`${API_BASE}/tournaments/t1`);
  });

  it('create calls POST /tournaments with body', async () => {
    const tournament = { name: 'Royal Rumble', type: 'single-elimination', participants: ['p1', 'p2'] };
    mockFetch({ tournamentId: 't-new', ...tournament });

    await tournamentsApi.create(tournament as never);

    expect(fetchCallUrl()).toBe(`${API_BASE}/tournaments`);
    expect(fetchCallOptions().method).toBe('POST');
    expect(fetchCallOptions().body).toBe(JSON.stringify(tournament));
  });

  it('update calls PUT /tournaments/:id with body', async () => {
    const updates = { status: 'completed' };
    mockFetch({ tournamentId: 't1', ...updates });

    await tournamentsApi.update('t1', updates);

    expect(fetchCallUrl()).toBe(`${API_BASE}/tournaments/t1`);
    expect(fetchCallOptions().method).toBe('PUT');
    expect(fetchCallOptions().body).toBe(JSON.stringify(updates));
  });
});

// ===========================================================================
// standingsApi
// ===========================================================================

describe('standingsApi', () => {
  it('get calls GET /standings without params when no seasonId', async () => {
    mockFetch({ standings: [] });

    await standingsApi.get();

    expect(fetchCallUrl()).toBe(`${API_BASE}/standings`);
  });

  it('get appends seasonId as query parameter', async () => {
    mockFetch({ standings: [] });

    await standingsApi.get('season-2024');

    expect(fetchCallUrl()).toBe(`${API_BASE}/standings?seasonId=season-2024`);
  });
});

// ===========================================================================
// seasonsApi
// ===========================================================================

describe('seasonsApi', () => {
  it('getAll calls GET /seasons', async () => {
    mockFetch([]);
    await seasonsApi.getAll();
    expect(fetchCallUrl()).toBe(`${API_BASE}/seasons`);
  });

  it('create calls POST /seasons with body', async () => {
    const season = { name: 'Season 1', startDate: '2024-01-01' };
    mockFetch({ seasonId: 's1', ...season });

    await seasonsApi.create(season);

    expect(fetchCallUrl()).toBe(`${API_BASE}/seasons`);
    expect(fetchCallOptions().method).toBe('POST');
    expect(fetchCallOptions().body).toBe(JSON.stringify(season));
  });

  it('update calls PUT /seasons/:id with body', async () => {
    const updates = { status: 'completed' };
    mockFetch({ seasonId: 's1', ...updates });

    await seasonsApi.update('s1', updates);

    expect(fetchCallUrl()).toBe(`${API_BASE}/seasons/s1`);
    expect(fetchCallOptions().method).toBe('PUT');
  });

  it('delete calls DELETE /seasons/:id', async () => {
    mockFetch(undefined, 204);
    await seasonsApi.delete('s1');
    expect(fetchCallUrl()).toBe(`${API_BASE}/seasons/s1`);
    expect(fetchCallOptions().method).toBe('DELETE');
  });
});

// ===========================================================================
// divisionsApi
// ===========================================================================

describe('divisionsApi', () => {
  it('getAll calls GET /divisions', async () => {
    mockFetch([]);
    await divisionsApi.getAll();
    expect(fetchCallUrl()).toBe(`${API_BASE}/divisions`);
  });

  it('create calls POST /divisions with body', async () => {
    const division = { name: 'Raw', description: 'Monday Night Raw' };
    mockFetch({ divisionId: 'd1', ...division });

    await divisionsApi.create(division);

    expect(fetchCallUrl()).toBe(`${API_BASE}/divisions`);
    expect(fetchCallOptions().method).toBe('POST');
    expect(fetchCallOptions().body).toBe(JSON.stringify(division));
  });

  it('update calls PUT /divisions/:id with body', async () => {
    const updates = { name: 'SmackDown' };
    mockFetch({ divisionId: 'd1', ...updates });

    await divisionsApi.update('d1', updates);

    expect(fetchCallUrl()).toBe(`${API_BASE}/divisions/d1`);
    expect(fetchCallOptions().method).toBe('PUT');
    expect(fetchCallOptions().body).toBe(JSON.stringify(updates));
  });

  it('delete calls DELETE /divisions/:id', async () => {
    mockFetch(undefined, 204);
    await divisionsApi.delete('d1');
    expect(fetchCallUrl()).toBe(`${API_BASE}/divisions/d1`);
    expect(fetchCallOptions().method).toBe('DELETE');
  });
});
