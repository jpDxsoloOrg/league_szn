import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Player } from '../../types';

const { authState, mockHeartbeat, mockLeavePresence } = vi.hoisted(() => ({
  authState: {
    isAuthenticated: true,
    isWrestler: true,
    playerId: 'p1',
    profile: null as Pick<Player, 'discipline'> | null,
  },
  mockHeartbeat: vi.fn(),
  mockLeavePresence: vi.fn(),
}));

vi.mock('../AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../../services/api/matchmaking.api', () => ({
  matchmakingApi: { heartbeat: mockHeartbeat, leavePresence: mockLeavePresence },
}));

import { ApiError } from '../../services/api/apiClient';
import { PresenceProvider, usePresence } from '../PresenceContext';

const SESSION_KEY = 'wwe2k.presenceEnabled';
const wrapper = ({ children }: { children: ReactNode }) => <PresenceProvider>{children}</PresenceProvider>;

const blockedProfile = (): Pick<Player, 'discipline'> => ({
  discipline: {
    status: 'signup-blocked',
    activeStrikeCount: 2,
    activeStrikes: [],
    cooldownEndsAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    signupBlockedUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    deactivatedAt: null,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  authState.profile = null;
  mockHeartbeat.mockResolvedValue(undefined);
  mockLeavePresence.mockResolvedValue(undefined);
});

describe('PresenceProvider during a sign-up block', () => {
  it('sends heartbeats as usual with no block', async () => {
    window.sessionStorage.setItem(SESSION_KEY, 'true');
    renderHook(() => usePresence(), { wrapper });
    await waitFor(() => expect(mockHeartbeat).toHaveBeenCalled());
  });

  it('starts no heartbeat while blocked, and turns the saved presence off', async () => {
    window.sessionStorage.setItem(SESSION_KEY, 'true');
    authState.profile = blockedProfile();
    const { result } = renderHook(() => usePresence(), { wrapper });

    await waitFor(() => expect(result.current.presenceEnabled).toBe(false));
    expect(mockHeartbeat).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('ignores an attempt to go online while blocked', async () => {
    authState.profile = blockedProfile();
    const { result } = renderHook(() => usePresence(), { wrapper });

    await act(async () => {
      await result.current.enablePresence();
    });

    expect(result.current.presenceEnabled).toBe(false);
    expect(mockHeartbeat).not.toHaveBeenCalled();
  });

  it('stops a running loop on a refused heartbeat, and leaves other failures alone', async () => {
    window.sessionStorage.setItem(SESSION_KEY, 'true');
    mockHeartbeat.mockRejectedValueOnce(new ApiError('Server error', 500));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result, rerender } = renderHook(() => usePresence(), { wrapper });

    await waitFor(() => expect(mockHeartbeat).toHaveBeenCalledTimes(1));
    expect(result.current.presenceEnabled).toBe(true);

    mockHeartbeat.mockRejectedValueOnce(new ApiError('Blocked', 403, { code: 'SIGNUP_BLOCKED' }));
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(result.current.presenceEnabled).toBe(false));
    expect(mockLeavePresence).toHaveBeenCalled();
    consoleError.mockRestore();

    rerender();
    expect(result.current.presenceEnabled).toBe(false);
  });

  it('does not come back on its own when the block ends', async () => {
    window.sessionStorage.setItem(SESSION_KEY, 'true');
    authState.profile = blockedProfile();
    const { result, rerender } = renderHook(() => usePresence(), { wrapper });
    await waitFor(() => expect(result.current.presenceEnabled).toBe(false));

    authState.profile = null;
    rerender();

    expect(result.current.presenceEnabled).toBe(false);
    expect(mockHeartbeat).not.toHaveBeenCalled();
  });
});
