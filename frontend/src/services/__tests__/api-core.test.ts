/**
 * Tests for fetchWithAuth (indirectly), authApi, and profileApi
 * from frontend/src/services/api.ts
 *
 * fetchWithAuth is a module-internal function. We test its behavior
 * indirectly by calling exported API functions and verifying how
 * global.fetch was invoked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authApi, profileApi, playersApi } from '../api';

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
          'Content-Type': 'application/json',
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
    expect(headers['Content-Type']).toBe('application/json');
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
      status: 500,
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

      await expect(playersApi.getAll()).rejects.toThrow(
        'Your session has expired. Please sign in again.',
      );
      expect(mockRefreshSession).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(1);
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
