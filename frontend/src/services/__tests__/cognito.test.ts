import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted mocks (vi.hoisted runs before vi.mock factory hoisting) ---
const {
  mockAmplifySignIn,
  mockAmplifySignUp,
  mockAmplifySignOut,
  mockAmplifyConfirmSignUp,
  mockAmplifyFetchAuthSession,
  mockAmplifyGetCurrentUser,
  mockAmplifyConfigure,
} = vi.hoisted(() => ({
  mockAmplifySignIn: vi.fn(),
  mockAmplifySignUp: vi.fn(),
  mockAmplifySignOut: vi.fn(),
  mockAmplifyConfirmSignUp: vi.fn(),
  mockAmplifyFetchAuthSession: vi.fn(),
  mockAmplifyGetCurrentUser: vi.fn(),
  mockAmplifyConfigure: vi.fn(),
}));

vi.mock('aws-amplify', () => ({
  Amplify: { configure: mockAmplifyConfigure },
}));

vi.mock('aws-amplify/auth', () => ({
  signIn: mockAmplifySignIn,
  signUp: mockAmplifySignUp,
  signOut: mockAmplifySignOut,
  confirmSignUp: mockAmplifyConfirmSignUp,
  fetchAuthSession: mockAmplifyFetchAuthSession,
  getCurrentUser: mockAmplifyGetCurrentUser,
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

import { cognitoAuth } from '../cognito';

describe('cognito service — auth flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  describe('signIn', () => {
    it('calls Amplify signIn, stores tokens in sessionStorage, returns auth result with groups', async () => {
      const accessToken = fakeJwt({ 'cognito:groups': ['Admin', 'Wrestler'] });
      const idToken = fakeJwt({ email: 'test@test.com' });

      mockAmplifySignOut.mockResolvedValue(undefined);
      mockAmplifySignIn.mockResolvedValue({ isSignedIn: true });
      mockAmplifyFetchAuthSession.mockResolvedValue({
        tokens: {
          accessToken: { toString: () => accessToken },
          idToken: { toString: () => idToken },
        },
      });

      const result = await cognitoAuth.signIn('user@test.com', 'pass123');

      expect(mockAmplifySignIn).toHaveBeenCalledWith({
        username: 'user@test.com',
        password: 'pass123',
      });
      expect(sessionStorage.getItem('accessToken')).toBe(accessToken);
      expect(sessionStorage.getItem('idToken')).toBe(idToken);
      expect(result.groups).toEqual(['Admin', 'Wrestler']);
      expect(result.expiresIn).toBe(86400);
    });

    it('throws readable error for NotAuthorizedException', async () => {
      mockAmplifySignOut.mockResolvedValue(undefined);
      const err = new Error('Incorrect username or password.');
      (err as Error & { name: string }).name = 'NotAuthorizedException';
      mockAmplifySignIn.mockRejectedValue(err);

      await expect(cognitoAuth.signIn('a@b.com', 'wrong')).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('throws specific error when user account is disabled', async () => {
      mockAmplifySignOut.mockResolvedValue(undefined);
      const err = new Error('User is disabled.');
      (err as Error & { name: string }).name = 'NotAuthorizedException';
      mockAmplifySignIn.mockRejectedValue(err);

      await expect(cognitoAuth.signIn('a@b.com', 'pass')).rejects.toThrow(
        'Your account is currently disabled',
      );
    });

    it('throws when tokens are missing after successful sign-in', async () => {
      mockAmplifySignOut.mockResolvedValue(undefined);
      mockAmplifySignIn.mockResolvedValue({ isSignedIn: true });
      mockAmplifyFetchAuthSession.mockResolvedValue({ tokens: null });

      await expect(cognitoAuth.signIn('a@b.com', 'pass')).rejects.toThrow(
        'Failed to get authentication tokens',
      );
    });

    it('handles CONFIRM_SIGN_UP next step', async () => {
      mockAmplifySignOut.mockResolvedValue(undefined);
      mockAmplifySignIn.mockResolvedValue({
        isSignedIn: false,
        nextStep: { signInStep: 'CONFIRM_SIGN_UP' },
      });

      await expect(cognitoAuth.signIn('a@b.com', 'pass')).rejects.toThrow(
        'Account not confirmed',
      );
    });

    it('handles UserNotConfirmedException', async () => {
      mockAmplifySignOut.mockResolvedValue(undefined);
      const err = new Error('User is not confirmed.');
      (err as Error & { name: string }).name = 'UserNotConfirmedException';
      mockAmplifySignIn.mockRejectedValue(err);

      await expect(cognitoAuth.signIn('a@b.com', 'pass')).rejects.toThrow(
        'Please verify your email before signing in',
      );
    });
  });

  describe('signUp', () => {
    it('calls Amplify signUp with email and returns correct shape', async () => {
      mockAmplifySignUp.mockResolvedValue({
        isSignUpComplete: false,
        userId: 'user-123',
      });

      const result = await cognitoAuth.signUp('a@b.com', 'Pass1234');

      expect(mockAmplifySignUp).toHaveBeenCalledWith({
        username: 'a@b.com',
        password: 'Pass1234',
        options: { userAttributes: { email: 'a@b.com' } },
      });
      expect(result).toEqual({ isConfirmed: false, userId: 'user-123' });
    });

    it('passes wrestlerName as custom attribute when provided', async () => {
      mockAmplifySignUp.mockResolvedValue({ isSignUpComplete: false, userId: 'u-1' });

      await cognitoAuth.signUp('a@b.com', 'Pass1234', { wrestlerName: 'The Rock' });

      expect(mockAmplifySignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            userAttributes: {
              email: 'a@b.com',
              'custom:wrestler_name': 'The Rock',
            },
          },
        }),
      );
    });

    it('throws readable error for UsernameExistsException', async () => {
      const err = new Error('User already exists');
      (err as Error & { name: string }).name = 'UsernameExistsException';
      mockAmplifySignUp.mockRejectedValue(err);

      await expect(cognitoAuth.signUp('dup@b.com', 'Pass1234')).rejects.toThrow(
        'An account with this email already exists',
      );
    });
  });

  describe('confirmSignUp', () => {
    it('calls Amplify confirmSignUp and returns isSignUpComplete', async () => {
      mockAmplifyConfirmSignUp.mockResolvedValue({ isSignUpComplete: true });

      const result = await cognitoAuth.confirmSignUp('a@b.com', '123456');

      expect(mockAmplifyConfirmSignUp).toHaveBeenCalledWith({
        username: 'a@b.com',
        confirmationCode: '123456',
      });
      expect(result).toBe(true);
    });

    it('throws readable error for CodeMismatchException', async () => {
      const err = new Error('Invalid code');
      (err as Error & { name: string }).name = 'CodeMismatchException';
      mockAmplifyConfirmSignUp.mockRejectedValue(err);

      await expect(cognitoAuth.confirmSignUp('a@b.com', '000000')).rejects.toThrow(
        'Invalid verification code',
      );
    });

    it('throws readable error for ExpiredCodeException', async () => {
      const err = new Error('Code expired');
      (err as Error & { name: string }).name = 'ExpiredCodeException';
      mockAmplifyConfirmSignUp.mockRejectedValue(err);

      await expect(cognitoAuth.confirmSignUp('a@b.com', '111111')).rejects.toThrow(
        'Verification code has expired',
      );
    });
  });

  describe('signOut', () => {
    it('calls Amplify signOut and clears sessionStorage tokens', async () => {
      sessionStorage.setItem('accessToken', 'tok');
      sessionStorage.setItem('idToken', 'id');
      sessionStorage.setItem('userGroups', '["Admin"]');
      mockAmplifySignOut.mockResolvedValue(undefined);

      await cognitoAuth.signOut();

      expect(mockAmplifySignOut).toHaveBeenCalled();
      expect(sessionStorage.getItem('accessToken')).toBeNull();
      expect(sessionStorage.getItem('idToken')).toBeNull();
      expect(sessionStorage.getItem('userGroups')).toBeNull();
    });

    it('clears sessionStorage even when Amplify signOut throws', async () => {
      sessionStorage.setItem('accessToken', 'tok');
      mockAmplifySignOut.mockRejectedValue(new Error('network'));

      await cognitoAuth.signOut();

      expect(sessionStorage.getItem('accessToken')).toBeNull();
    });
  });

  describe('refreshSession', () => {
    it('calls fetchAuthSession with forceRefresh and updates sessionStorage', async () => {
      const accessToken = fakeJwt({ 'cognito:groups': ['Wrestler'] });
      const idToken = fakeJwt({ email: 'w@test.com' });

      mockAmplifyFetchAuthSession.mockResolvedValue({
        tokens: {
          accessToken: { toString: () => accessToken },
          idToken: { toString: () => idToken },
        },
      });

      const result = await cognitoAuth.refreshSession();

      expect(mockAmplifyFetchAuthSession).toHaveBeenCalledWith({ forceRefresh: true });
      expect(sessionStorage.getItem('accessToken')).toBe(accessToken);
      expect(sessionStorage.getItem('idToken')).toBe(idToken);
      expect(result).toEqual({
        accessToken,
        idToken,
        expiresIn: 86400,
        groups: ['Wrestler'],
      });
    });

    it('returns null when session has no tokens', async () => {
      mockAmplifyFetchAuthSession.mockResolvedValue({ tokens: null });
      expect(await cognitoAuth.refreshSession()).toBeNull();
    });

    it('returns null when fetchAuthSession throws', async () => {
      mockAmplifyFetchAuthSession.mockRejectedValue(new Error('network error'));
      expect(await cognitoAuth.refreshSession()).toBeNull();
    });
  });

  describe('getCurrentUser', () => {
    it('returns user object from Amplify', async () => {
      const user = { username: 'test-user', userId: 'u-1' };
      mockAmplifyGetCurrentUser.mockResolvedValue(user);
      expect(await cognitoAuth.getCurrentUser()).toEqual(user);
    });

    it('returns null when not authenticated', async () => {
      mockAmplifyGetCurrentUser.mockRejectedValue(new Error('not authenticated'));
      expect(await cognitoAuth.getCurrentUser()).toBeNull();
    });
  });
});
