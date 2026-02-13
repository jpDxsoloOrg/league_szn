import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// --- Hoisted mocks ---
const {
  mockGetCurrentUser,
  mockRefreshSession,
  mockGetUserGroups,
  mockIsAuthenticatedSync,
  mockSignIn,
  mockSignUp,
  mockConfirmSignUp,
  mockSignOut,
  mockGetMyProfile,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockRefreshSession: vi.fn(),
  mockGetUserGroups: vi.fn(),
  mockIsAuthenticatedSync: vi.fn(),
  mockSignIn: vi.fn(),
  mockSignUp: vi.fn(),
  mockConfirmSignUp: vi.fn(),
  mockSignOut: vi.fn(),
  mockGetMyProfile: vi.fn(),
}));

vi.mock('../../services/cognito', () => ({
  cognitoAuth: {
    getCurrentUser: mockGetCurrentUser,
    refreshSession: mockRefreshSession,
    getUserGroups: mockGetUserGroups,
    isAuthenticatedSync: mockIsAuthenticatedSync,
    signIn: mockSignIn,
    signUp: mockSignUp,
    confirmSignUp: mockConfirmSignUp,
    signOut: mockSignOut,
  },
}));

vi.mock('../../services/api', () => ({
  profileApi: {
    getMyProfile: mockGetMyProfile,
  },
}));

import { AuthProvider, useAuth } from '../AuthContext';

// --- Test wrapper ---
function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

// --- Helpers to set up common mock scenarios ---
function mockUnauthenticatedUser() {
  mockIsAuthenticatedSync.mockReturnValue(false);
  mockGetUserGroups.mockReturnValue([]);
  mockGetCurrentUser.mockResolvedValue(null);
}

function mockAuthenticatedUser(
  groups: string[],
  opts?: { playerId?: string; email?: string }
) {
  mockIsAuthenticatedSync.mockReturnValue(true);
  mockGetUserGroups.mockReturnValue(groups);
  mockGetCurrentUser.mockResolvedValue({
    username: 'user-123',
    signInDetails: { loginId: opts?.email ?? 'test@example.com' },
  });
  mockRefreshSession.mockResolvedValue({ groups });
  if (groups.includes('Wrestler') && opts?.playerId) {
    mockGetMyProfile.mockResolvedValue({ playerId: opts.playerId });
  }
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // P0: Initialization on mount
  // ===========================================================================
  describe('initialization on mount', () => {
    it('sets isAuthenticated=true and extracts groups when user is logged in', async () => {
      mockAuthenticatedUser(['Admin']);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.groups).toEqual(['Admin']);
      expect(result.current.email).toBe('test@example.com');
    });

    it('sets isAuthenticated=false when no current user', async () => {
      mockUnauthenticatedUser();

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.groups).toEqual([]);
      expect(result.current.email).toBeNull();
      expect(result.current.playerId).toBeNull();
    });

    it('fetches player profile and sets playerId for Wrestlers', async () => {
      mockAuthenticatedUser(['Wrestler'], { playerId: 'player-456' });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockGetMyProfile).toHaveBeenCalled();
      expect(result.current.playerId).toBe('player-456');
      expect(result.current.isWrestler).toBe(true);
    });

    it('does not fetch player profile for non-Wrestlers', async () => {
      mockAuthenticatedUser(['Fantasy']);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockGetMyProfile).not.toHaveBeenCalled();
      expect(result.current.playerId).toBeNull();
    });

    it('handles getCurrentUser throwing by setting unauthenticated state', async () => {
      mockIsAuthenticatedSync.mockReturnValue(false);
      mockGetUserGroups.mockReturnValue([]);
      mockGetCurrentUser.mockRejectedValue(new Error('network failure'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.groups).toEqual([]);
    });

    it('handles profile fetch failure gracefully (playerId stays null)', async () => {
      mockIsAuthenticatedSync.mockReturnValue(true);
      mockGetUserGroups.mockReturnValue(['Wrestler']);
      mockGetCurrentUser.mockResolvedValue({
        username: 'u-1',
        signInDetails: { loginId: 'w@test.com' },
      });
      mockRefreshSession.mockResolvedValue({ groups: ['Wrestler'] });
      mockGetMyProfile.mockRejectedValue(new Error('404 not found'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.playerId).toBeNull();
    });
  });

  // ===========================================================================
  // P0: Role helpers
  // ===========================================================================
  describe('role helpers', () => {
    it('isAdmin is true for Admin group', async () => {
      mockAuthenticatedUser(['Admin']);
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAdmin).toBe(true);
      expect(result.current.isSuperAdmin).toBe(true);
    });

    it('isAdmin is true for Moderator, but isSuperAdmin is false', async () => {
      mockAuthenticatedUser(['Moderator']);
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAdmin).toBe(true);
      expect(result.current.isSuperAdmin).toBe(false);
      expect(result.current.isModerator).toBe(true);
    });

    it('isWrestler and isFantasy return correct values for Wrestler group', async () => {
      mockAuthenticatedUser(['Wrestler'], { playerId: 'p-1' });
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isWrestler).toBe(true);
      expect(result.current.isFantasy).toBe(false);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.isModerator).toBe(false);
    });

    it('isFantasy returns true for Fantasy group', async () => {
      mockAuthenticatedUser(['Fantasy']);
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isFantasy).toBe(true);
      expect(result.current.isWrestler).toBe(false);
    });

    it('hasRole checks role hierarchy -- Admin has all roles', async () => {
      mockAuthenticatedUser(['Admin']);
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.hasRole('Admin')).toBe(true);
      expect(result.current.hasRole('Moderator')).toBe(true);
      expect(result.current.hasRole('Wrestler')).toBe(true);
      expect(result.current.hasRole('Fantasy')).toBe(true);
    });

    it('hasRole -- Moderator has all roles except Admin', async () => {
      mockAuthenticatedUser(['Moderator']);
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.hasRole('Admin')).toBe(false);
      expect(result.current.hasRole('Moderator')).toBe(true);
      expect(result.current.hasRole('Wrestler')).toBe(true);
      expect(result.current.hasRole('Fantasy')).toBe(true);
    });
  });

  // ===========================================================================
  // P1: Sign in / sign out / refreshProfile
  // ===========================================================================
  describe('signIn / signOut / refreshProfile', () => {
    it('signIn updates state with authenticated user data', async () => {
      mockUnauthenticatedUser();
      mockSignIn.mockResolvedValue({ groups: ['Wrestler'] });
      mockGetMyProfile.mockResolvedValue({ playerId: 'p-99' });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAuthenticated).toBe(false);

      await act(async () => {
        await result.current.signIn('user@test.com', 'Password1');
      });

      expect(mockSignIn).toHaveBeenCalledWith('user@test.com', 'Password1');
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.groups).toEqual(['Wrestler']);
      expect(result.current.email).toBe('user@test.com');
      expect(result.current.playerId).toBe('p-99');
    });

    it('signOut clears all auth state', async () => {
      mockAuthenticatedUser(['Admin']);
      mockSignOut.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAuthenticated).toBe(true);

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockSignOut).toHaveBeenCalled();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.groups).toEqual([]);
      expect(result.current.email).toBeNull();
      expect(result.current.playerId).toBeNull();
    });

    it('refreshProfile re-fetches player profile and updates playerId', async () => {
      mockAuthenticatedUser(['Wrestler'], { playerId: 'p-1' });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.playerId).toBe('p-1');

      // Simulate profile update
      mockGetMyProfile.mockResolvedValue({ playerId: 'p-2' });

      await act(async () => {
        await result.current.refreshProfile();
      });

      expect(result.current.playerId).toBe('p-2');
    });
  });

  // ===========================================================================
  // P1: Cleanup -- mounted flag prevents state updates after unmount
  // ===========================================================================
  describe('cleanup', () => {
    it('does not update state after unmount during init', async () => {
      // Create a promise we can control to delay getCurrentUser
      let resolveUser!: (value: unknown) => void;
      const userPromise = new Promise((resolve) => {
        resolveUser = resolve;
      });
      mockIsAuthenticatedSync.mockReturnValue(true);
      mockGetUserGroups.mockReturnValue([]);
      mockGetCurrentUser.mockReturnValue(userPromise);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { unmount } = renderHook(() => useAuth(), { wrapper });

      // Unmount before the async init completes
      unmount();

      // Now resolve the pending promise -- should not trigger setState warnings
      resolveUser({
        username: 'late-user',
        signInDetails: { loginId: 'late@test.com' },
      });

      // Give microtask queue a chance to flush
      await new Promise((r) => setTimeout(r, 50));

      // No "Can't perform a React state update on an unmounted component" warning
      // The mounted flag in the useEffect prevents the setState call
      const stateUpdateWarnings = consoleSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('unmounted')
      );
      expect(stateUpdateWarnings).toHaveLength(0);

      consoleSpy.mockRestore();
    });

    it('useAuth throws when used outside AuthProvider', () => {
      // Suppress React error boundary console output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleSpy.mockRestore();
    });
  });
});
