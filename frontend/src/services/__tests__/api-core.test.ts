/**
 * Tests for fetchWithAuth (indirectly), authApi, and profileApi
 * from frontend/src/services/api.ts
 *
 * fetchWithAuth is a module-internal function. We test its behavior
 * indirectly by calling exported API functions and verifying how
 * global.fetch was invoked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, AUTH_EXPIRED_EVENT, authApi, eventsApi, isApiError, profileApi, playersApi, promosApi } from '../api';

// fetchWithAuth lazily imports the cognito service on the 401-refresh path;
// mock it so tests never load aws-amplify.
const { mockRefreshSession } = vi.hoisted(() => ({ mockRefreshSession: vi.fn() }));
vi.mock('../cognito', () => ({
  cognitoAuth: { refreshSession: mockRefreshSession },
}));

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchResponse(body: unknown, init: Partial<Response> = {}) {
  const status = init.status ?? 200;
  return vi.fn().mockResolvedValue({
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  global.fetch = mockFetchResponse([]);
});

// ===========================================================================
// fetchWithAuth (tested indirectly via playersApi.getAll)
// ===========================================================================

describe('fetchWithAuth (indirect)', () => {
  it('adds Authorization header when token exists in sessionStorage', async () => {
    sessionStorage.setItem('accessToken', 'test-jwt-token');
    global.fetch = mockFetchResponse([]);

    await playersApi.getAll();

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/players`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-jwt-token',
        }),
      }),
    );
  });

  it('omits Authorization header when no token in sessionStorage', async () => {
    global.fetch = mockFetchResponse([]);

    await playersApi.getAll();

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = callArgs[1].headers as Record<string, string>;
    expect(headers).not.toHaveProperty('Authorization');
  });

  it('sends Content-Type only when the request has a body', async () => {
    global.fetch = mockFetchResponse([]);

    await playersApi.getAll();
    await playersApi.create({ name: 'A', currentWrestler: 'B' } as never);

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![1].headers).not.toHaveProperty('Content-Type');
    expect(calls[1]![1].headers['Content-Type']).toBe('application/json');
  });

  it('throws an ApiError carrying the HTTP status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({ message: 'Player not found' }),
    });

    const failure = await playersApi.getById('missing').catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 404, message: 'Player not found' });
    expect(isApiError(failure, 404)).toBe(true);
    expect(isApiError(failure, 401)).toBe(false);
  });

  it('requests the directory and staff views of players', async () => {
    global.fetch = mockFetchResponse([]);

    await playersApi.getDirectory();
    await playersApi.getAllIncludingHidden();

    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
    expect(urls).toEqual([`${API_BASE}/players?view=directory`, `${API_BASE}/players?includeHidden=true`]);
  });

  it('passes includeArchived to the promos API', async () => {
    global.fetch = mockFetchResponse([]);

    await promosApi.getAll({ includeArchived: true });

    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/promos?includeArchived=true`, expect.anything());
  });

  it('getMyCheckIn resolves null on 404 and rethrows other failures', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: vi.fn().mockResolvedValue({ message: 'none' }) });
    await expect(eventsApi.getMyCheckIn('event-1')).resolves.toBeNull();

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, json: vi.fn().mockResolvedValue({ message: 'boom' }) });
    await expect(eventsApi.getMyCheckIn('event-1')).rejects.toThrow('boom');
  });

  it('returns undefined for 204 No Content responses', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: vi.fn(),
      text: vi.fn().mockResolvedValue(''),
    });

    const result = await playersApi.delete('player-1');

    expect(result).toBeUndefined();
  });

  it('throws on non-ok responses with error message from body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ message: 'Player name is required' }),
    });

    await expect(playersApi.create({ name: '', currentWrestler: 'X' } as never))
      .rejects.toThrow('Player name is required');
  });

  it('throws generic message when error body is not JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockRejectedValue(new Error('not JSON')),
    });

    await expect(playersApi.getAll()).rejects.toThrow('Request failed');
  });

  it('passes AbortSignal through to fetch', async () => {
    global.fetch = mockFetchResponse([]);
    const controller = new AbortController();

    await playersApi.getAll(controller.signal);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  describe('expired-session refresh on 401', () => {
    beforeEach(() => {
      mockRefreshSession.mockReset();
    });

    it('refreshes the session and retries once when a token-bearing request gets 401', async () => {
      sessionStorage.setItem('accessToken', 'expired-token');
      mockRefreshSession.mockResolvedValue({ accessToken: 'fresh-token' });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 401, json: vi.fn() })
        .mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue([]) });

      const result = await playersApi.getAll();

      expect(result).toEqual([]);
      expect(mockRefreshSession).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      const retryHeaders = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1]
        .headers as Record<string, string>;
      expect(retryHeaders['Authorization']).toBe('Bearer fresh-token');
    });

    it('throws a session-expired message when refresh fails', async () => {
      sessionStorage.setItem('accessToken', 'expired-token');
      mockRefreshSession.mockResolvedValue(null);
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ message: 'Unauthorized' }),
      });

      const onExpired = vi.fn();
      window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);

      await expect(playersApi.getAll()).rejects.toThrow(
        'Your session has expired. Please sign in again.',
      );
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);

      expect(mockRefreshSession).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(onExpired).toHaveBeenCalledTimes(1);
    });

    it('does not attempt a refresh for unauthenticated 401s', async () => {
      mockRefreshSession.mockResolvedValue(null);
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ message: 'Unauthorized' }),
      });

      await expect(playersApi.getAll()).rejects.toThrow('Unauthorized');
      expect(mockRefreshSession).not.toHaveBeenCalled();
    });
  });
});

// ===========================================================================
// Transient failure retries
// ===========================================================================

describe('fetchWithAuth retries', () => {
  const failure = (status: number) => ({
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({ message: `HTTP ${status}` }),
  });
  const success = (body: unknown) => ({ ok: true, status: 200, json: vi.fn().mockResolvedValue(body) });
  const fetchCalls = () => (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([429, 500, 502, 503])('retries a GET that fails with %i', async (status) => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(failure(status))
      .mockResolvedValueOnce(success([{ playerId: 'p1' }]));

    const result = playersApi.getAll();
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual([{ playerId: 'p1' }]);
    expect(fetchCalls()).toBe(2);
  });

  it('gives up after two retries and reports the last failure', async () => {
    global.fetch = vi.fn().mockResolvedValue(failure(503));

    const result = playersApi.getAll().catch((err: unknown) => err);
    await vi.runAllTimersAsync();

    expect(await result).toMatchObject({ status: 503 });
    expect(fetchCalls()).toBe(3);
  });

  it('waits longer before the second retry, with jitter', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    global.fetch = vi.fn().mockResolvedValue(failure(500));

    const result = playersApi.getAll().catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(399);
    expect(fetchCalls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCalls()).toBe(2);
    await vi.advanceTimersByTimeAsync(799);
    expect(fetchCalls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCalls()).toBe(3);

    await result;
    random.mockRestore();
  });

  it.each([400, 403, 404, 504])('does not retry a GET that fails with %i', async (status) => {
    global.fetch = vi.fn().mockResolvedValue(failure(status));

    const result = playersApi.getAll().catch((err: unknown) => err);
    await vi.runAllTimersAsync();

    expect(await result).toMatchObject({ status });
    expect(fetchCalls()).toBe(1);
  });

  it('never retries a write', async () => {
    global.fetch = vi.fn().mockResolvedValue(failure(503));

    const created = playersApi.create({ name: 'A', currentWrestler: 'B' } as never).catch((err: unknown) => err);
    await vi.runAllTimersAsync();
    expect(await created).toMatchObject({ status: 503 });
    expect(fetchCalls()).toBe(1);

    const deleted = playersApi.delete('player-1').catch((err: unknown) => err);
    await vi.runAllTimersAsync();
    expect(await deleted).toMatchObject({ status: 503 });
    expect(fetchCalls()).toBe(2);
  });

  it('stops waiting as soon as the caller aborts', async () => {
    global.fetch = vi.fn().mockResolvedValue(failure(500));
    const controller = new AbortController();

    const result = playersApi.getAll(controller.signal).catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();

    expect(await result).toMatchObject({ name: 'AbortError' });
    await vi.runAllTimersAsync();
    expect(fetchCalls()).toBe(1);
  });

  it('retries a transient failure on the request made after a token refresh', async () => {
    sessionStorage.setItem('accessToken', 'expired-token');
    mockRefreshSession.mockResolvedValue({ accessToken: 'fresh-token' });
    global.fetch = vi.fn()
      .mockResolvedValueOnce(failure(401))
      .mockResolvedValueOnce(failure(500))
      .mockResolvedValueOnce(success([]));

    const result = playersApi.getAll();
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual([]);
    expect(fetchCalls()).toBe(3);
  });
});

// ===========================================================================
// authApi
// ===========================================================================

describe('authApi', () => {
  it('setToken stores token in sessionStorage', () => {
    authApi.setToken('my-access-token');
    expect(sessionStorage.getItem('accessToken')).toBe('my-access-token');
  });

  it('clearToken removes accessToken and idToken from sessionStorage', () => {
    sessionStorage.setItem('accessToken', 'a');
    sessionStorage.setItem('idToken', 'b');

    authApi.clearToken();

    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('idToken')).toBeNull();
  });

  it('isAuthenticated returns true when accessToken exists', () => {
    sessionStorage.setItem('accessToken', 'token');
    expect(authApi.isAuthenticated()).toBe(true);
  });

  it('isAuthenticated returns false when no accessToken', () => {
    expect(authApi.isAuthenticated()).toBe(false);
  });

  it('getToken returns the stored token or null', () => {
    expect(authApi.getToken()).toBeNull();
    sessionStorage.setItem('accessToken', 'abc');
    expect(authApi.getToken()).toBe('abc');
  });
});

// ===========================================================================
// profileApi
// ===========================================================================

describe('profileApi', () => {
  it('getMyProfile calls GET /players/me', async () => {
    const mockPlayer = { playerId: 'p1', name: 'Test', currentWrestler: 'W' };
    global.fetch = mockFetchResponse(mockPlayer);

    const result = await profileApi.getMyProfile();

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/players/me`,
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    // Default method is GET (no explicit method in options)
    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].method).toBeUndefined();
    expect(result).toEqual(mockPlayer);
  });

  it('updateMyProfile calls PUT /players/me with body', async () => {
    const updates = { name: 'New Name', imageUrl: 'https://img.com/pic.jpg' };
    const mockResponse = { playerId: 'p1', ...updates };
    global.fetch = mockFetchResponse(mockResponse);

    const result = await profileApi.updateMyProfile(updates);

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/players/me`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    );
    expect(result).toEqual(mockResponse);
  });
});
