import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeProgressionError, progressionApi } from '../api';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
type FetchMock = ReturnType<typeof vi.fn>;

function mockRes(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300, status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

const fetchMock = () => global.fetch as FetchMock;
const callUrl = (i = 0) => fetchMock().mock.calls[i][0] as string;
const callOpts = (i = 0) => fetchMock().mock.calls[i][1] as RequestInit;
const callBody = (i = 0) => JSON.parse(callOpts(i).body as string);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.setItem('accessToken', 'test-token-123');
  global.fetch = vi.fn();
  fetchMock().mockResolvedValue(mockRes({}));
});
afterEach(() => { sessionStorage.clear(); });

describe('progressionApi', () => {
  it('getForPlayer calls GET /progression/players/:id', async () => {
    await progressionApi.getForPlayer('p1');
    expect(callUrl()).toBe(`${API_BASE}/progression/players/p1`);
  });

  it('getTracks passes filters as query parameters', async () => {
    await progressionApi.getTracks();
    expect(callUrl(0)).toBe(`${API_BASE}/progression/tracks`);
    await progressionApi.getTracks({ kind: 'callup', isActive: true, fromDivisionId: 'd1' });
    expect(callUrl(1)).toBe(`${API_BASE}/progression/tracks?kind=callup&isActive=true&fromDivisionId=d1`);
  });

  it('createTrack and updateTrack send POST and PUT bodies', async () => {
    const input = { kind: 'callup' as const, name: 'YB', fromDivisionId: 'd1', goals: [{ metric: 'wins' as const, threshold: 5 }] };
    await progressionApi.createTrack(input);
    expect(callUrl(0)).toBe(`${API_BASE}/progression/tracks`);
    expect(callOpts(0).method).toBe('POST');
    expect(callBody(0)).toEqual(input);

    await progressionApi.updateTrack('t1', { toDivisionId: null });
    expect(callUrl(1)).toBe(`${API_BASE}/progression/tracks/t1`);
    expect(callOpts(1).method).toBe('PUT');
    expect(callBody(1)).toEqual({ toDivisionId: null });
  });

  it('getBoard calls the track players endpoint with an optional limit', async () => {
    await progressionApi.getBoard('t1');
    expect(callUrl(0)).toBe(`${API_BASE}/progression/tracks/t1/players`);
    await progressionApi.getBoard('t1', 10);
    expect(callUrl(1)).toBe(`${API_BASE}/progression/tracks/t1/players?limit=10`);
  });

  it('covers the consideration, execute and recompute endpoints', async () => {
    await progressionApi.setConsideration('p1', { trackId: 't1', considering: true, note: 'Soon' });
    expect(callUrl(0)).toBe(`${API_BASE}/progression/players/p1/consideration`);
    expect(callOpts(0).method).toBe('PUT');
    expect(callBody(0)).toEqual({ trackId: 't1', considering: true, note: 'Soon' });

    await progressionApi.getConsiderations();
    expect(callUrl(1)).toBe(`${API_BASE}/progression/considerations?kind=callup`);

    await progressionApi.execute('p1', { trackId: 't1', toDivisionId: 'd2', announce: true });
    expect(callUrl(2)).toBe(`${API_BASE}/progression/players/p1/execute`);
    expect(callOpts(2).method).toBe('POST');

    await progressionApi.recompute({ playerIds: ['p1'] });
    expect(callUrl(3)).toBe(`${API_BASE}/admin/progression/recompute`);
    expect(callBody(3)).toEqual({ playerIds: ['p1'] });

    await progressionApi.recompute();
    expect(callBody(4)).toEqual({});
  });

  it('reads a coded execute refusal from the thrown error', async () => {
    fetchMock().mockResolvedValue(mockRes({
      code: 'HOLDS_DIVISION_TITLE',
      message: 'Player holds a championship restricted to their current division',
      championships: [{ championshipId: 'c1', name: 'YB Title' }],
    }, 409));

    const err = await progressionApi.execute('p1', { trackId: 't1' }).catch((e: unknown) => e);
    const refusal = executeProgressionError(err);

    expect(refusal?.code).toBe('HOLDS_DIVISION_TITLE');
    if (refusal?.code === 'HOLDS_DIVISION_TITLE') {
      expect(refusal.championships).toEqual([{ championshipId: 'c1', name: 'YB Title' }]);
    }
    expect(executeProgressionError(new Error('network'))).toBeNull();
  });
});
