import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted mocks ---
const { mockAmplifyConfigure, mockAmplifyFetchAuthSession } = vi.hoisted(() => ({
  mockAmplifyConfigure: vi.fn(),
  mockAmplifyFetchAuthSession: vi.fn(),
}));

vi.mock('aws-amplify', () => ({
  Amplify: { configure: mockAmplifyConfigure },
}));

vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  confirmSignUp: vi.fn(),
  fetchAuthSession: mockAmplifyFetchAuthSession,
  getCurrentUser: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// --- Helper: build a fake JWT with given payload ---
function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

import { cognitoAuth, getGroupsFromToken } from '../cognito';

// ---------------------------------------------------------------------------
// Token management, role helpers, JWT helpers
// ---------------------------------------------------------------------------
describe('cognito service — tokens, roles & JWT', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  // =========================================================================
  // P0: Token management
  // =========================================================================
  describe('token management', () => {
    it('getAccessToken reads from sessionStorage', () => {
      sessionStorage.setItem('accessToken', 'my-access-token');
      expect(cognitoAuth.getAccessToken()).toBe('my-access-token');
    });

    it('getAccessToken returns null when no token stored', () => {
      expect(cognitoAuth.getAccessToken()).toBeNull();
    });

    it('getIdToken reads from sessionStorage', () => {
      sessionStorage.setItem('idToken', 'my-id-token');
      expect(cognitoAuth.getIdToken()).toBe('my-id-token');
    });

    it('getUserGroups parses groups from sessionStorage', () => {
      sessionStorage.setItem('userGroups', JSON.stringify(['Admin', 'Wrestler']));
      expect(cognitoAuth.getUserGroups()).toEqual(['Admin', 'Wrestler']);
    });

    it('getUserGroups returns empty array when no groups stored', () => {
      expect(cognitoAuth.getUserGroups()).toEqual([]);
    });

    it('getUserGroups returns empty array on malformed JSON', () => {
      sessionStorage.setItem('userGroups', 'not-json');
      expect(cognitoAuth.getUserGroups()).toEqual([]);
    });

    it('isAuthenticated returns true when session has access token', async () => {
      mockAmplifyFetchAuthSession.mockResolvedValue({
        tokens: { accessToken: 'tok' },
      });
      expect(await cognitoAuth.isAuthenticated()).toBe(true);
    });

    it('isAuthenticated returns false when session fetch fails', async () => {
      mockAmplifyFetchAuthSession.mockRejectedValue(new Error('no session'));
      expect(await cognitoAuth.isAuthenticated()).toBe(false);
    });

    it('isAuthenticatedSync returns true when accessToken in sessionStorage', () => {
      sessionStorage.setItem('accessToken', 'tok');
      expect(cognitoAuth.isAuthenticatedSync()).toBe(true);
    });

    it('isAuthenticatedSync returns false when sessionStorage is empty', () => {
      expect(cognitoAuth.isAuthenticatedSync()).toBe(false);
    });
  });

  // =========================================================================
  // P0: Role helpers
  // =========================================================================
  describe('role helpers', () => {
    describe('hasRole', () => {
      it('Admin has access to every role', () => {
        sessionStorage.setItem('userGroups', JSON.stringify(['Admin']));
        expect(cognitoAuth.hasRole('Admin')).toBe(true);
        expect(cognitoAuth.hasRole('Moderator')).toBe(true);
        expect(cognitoAuth.hasRole('Wrestler')).toBe(true);
        expect(cognitoAuth.hasRole('Fantasy')).toBe(true);
      });

      it('Moderator has access to non-Admin roles', () => {
        sessionStorage.setItem('userGroups', JSON.stringify(['Moderator']));
        expect(cognitoAuth.hasRole('Admin')).toBe(false);
        expect(cognitoAuth.hasRole('Moderator')).toBe(true);
        expect(cognitoAuth.hasRole('Wrestler')).toBe(true);
        expect(cognitoAuth.hasRole('Fantasy')).toBe(true);
      });

      it('Wrestler only has access to Wrestler role', () => {
        sessionStorage.setItem('userGroups', JSON.stringify(['Wrestler']));
        expect(cognitoAuth.hasRole('Admin')).toBe(false);
        expect(cognitoAuth.hasRole('Moderator')).toBe(false);
        expect(cognitoAuth.hasRole('Wrestler')).toBe(true);
        expect(cognitoAuth.hasRole('Fantasy')).toBe(false);
      });

      it('Fantasy only has access to Fantasy role', () => {
        sessionStorage.setItem('userGroups', JSON.stringify(['Fantasy']));
        expect(cognitoAuth.hasRole('Admin')).toBe(false);
        expect(cognitoAuth.hasRole('Wrestler')).toBe(false);
        expect(cognitoAuth.hasRole('Fantasy')).toBe(true);
      });
    });

    it('isAdmin returns true only for Admin group', () => {
      sessionStorage.setItem('userGroups', JSON.stringify(['Admin']));
      expect(cognitoAuth.isAdmin()).toBe(true);

      sessionStorage.setItem('userGroups', JSON.stringify(['Moderator']));
      expect(cognitoAuth.isAdmin()).toBe(false);
    });

    it('isWrestler returns true for Wrestler group', () => {
      sessionStorage.setItem('userGroups', JSON.stringify(['Wrestler']));
      expect(cognitoAuth.isWrestler()).toBe(true);
    });

    it('isWrestler returns true for Admin (hierarchy)', () => {
      sessionStorage.setItem('userGroups', JSON.stringify(['Admin']));
      expect(cognitoAuth.isWrestler()).toBe(true);
    });
  });

  // =========================================================================
  // P1: JWT helpers (getGroupsFromToken + decodeJwtPayload)
  // =========================================================================
  describe('JWT helpers', () => {
    it('getGroupsFromToken extracts cognito:groups from valid JWT', () => {
      const token = fakeJwt({ 'cognito:groups': ['Admin', 'Wrestler'] });
      expect(getGroupsFromToken(token)).toEqual(['Admin', 'Wrestler']);
    });

    it('getGroupsFromToken filters out unknown groups', () => {
      const token = fakeJwt({ 'cognito:groups': ['Admin', 'UnknownRole', 'Fantasy'] });
      expect(getGroupsFromToken(token)).toEqual(['Admin', 'Fantasy']);
    });

    it('getGroupsFromToken returns empty array for malformed token', () => {
      expect(getGroupsFromToken('not-a-jwt')).toEqual([]);
    });

    it('getGroupsFromToken returns empty array when cognito:groups is absent', () => {
      const token = fakeJwt({ sub: '123' });
      expect(getGroupsFromToken(token)).toEqual([]);
    });
  });
});
