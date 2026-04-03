import { Amplify } from 'aws-amplify';
import { signIn, signUp, signOut, confirmSignUp, fetchAuthSession, getCurrentUser, resetPassword, confirmResetPassword } from 'aws-amplify/auth';
import { logger } from '../utils/logger';

export type UserRole = 'Admin' | 'Moderator' | 'Wrestler' | 'Fantasy';

// Cognito configuration from environment variables
const cognitoConfig = {
  userPoolId: import.meta.env['VITE_COGNITO_USER_POOL_ID'] ?? '',
  userPoolClientId: import.meta.env['VITE_COGNITO_CLIENT_ID'] ?? '',
  region: import.meta.env['VITE_AWS_REGION'] ?? 'us-east-1',
};

// Configure Amplify
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: cognitoConfig.userPoolId,
      userPoolClientId: cognitoConfig.userPoolClientId,
    },
  },
});

export interface CognitoAuthResult {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
  groups: UserRole[];
}

/**
 * Decode a JWT payload without verification (for extracting claims client-side).
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return {};
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return {};
  }
}

/**
 * Extract user groups from an access token.
 */
export function getGroupsFromToken(accessToken: string): UserRole[] {
  const payload = decodeJwtPayload(accessToken);
  const groups = (payload['cognito:groups'] as string[]) || [];
  return groups.filter((g): g is UserRole => ['Admin', 'Moderator', 'Wrestler', 'Fantasy'].includes(g));
}

export const cognitoAuth = {
  /**
   * Sign in with email and password
   */
  signIn: async (username: string, password: string): Promise<CognitoAuthResult> => {
    try {
      logger.debug('Attempting sign in');

      // Clear any existing session before attempting new sign in
      try {
        await signOut();
      } catch {
        // Ignore errors from signOut - user may not be signed in
      }

      const result = await signIn({
        username,
        password,
      });

      logger.debug('Sign in completed');

      if (result.isSignedIn) {
        const session = await fetchAuthSession();
        const tokens = session.tokens;

        if (!tokens?.accessToken || !tokens?.idToken) {
          throw new Error('Failed to get authentication tokens');
        }

        const accessToken = tokens.accessToken.toString();
        const idToken = tokens.idToken.toString();

        // Extract groups from the access token
        const groups = getGroupsFromToken(accessToken);

        // Store tokens and groups in session storage
        sessionStorage.setItem('accessToken', accessToken);
        sessionStorage.setItem('idToken', idToken);
        sessionStorage.setItem('userGroups', JSON.stringify(groups));

        return {
          accessToken,
          idToken,
          expiresIn: 86400, // 24 hours
          groups,
        };
      }

      // Handle different sign-in states
      const nextStep = result.nextStep?.signInStep;
      if (nextStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        throw new Error('Password change required. Please contact administrator.');
      } else if (nextStep === 'CONFIRM_SIGN_UP') {
        throw new Error('Account not confirmed. Please check your email for a verification code.');
      } else if (nextStep) {
        throw new Error(`Additional step required: ${nextStep}`);
      }

      throw new Error('Sign in failed - unexpected state');
    } catch (error: unknown) {
      logger.error('Cognito sign in error');

      if (error instanceof Error) {
        const cognitoError = error as Error & { name?: string };
        if (cognitoError.name === 'NotAuthorizedException') {
          // Check if user is disabled (Cognito returns this for disabled users)
          if (error.message?.toLowerCase().includes('disabled')) {
            throw new Error('Your account is currently disabled. Please contact an administrator.');
          }
          throw new Error('Invalid email or password');
        } else if (cognitoError.name === 'UserNotFoundException') {
          throw new Error('User not found');
        } else if (cognitoError.name === 'UserNotConfirmedException') {
          throw new Error('Please verify your email before signing in');
        }
        throw new Error(error.message || 'Authentication failed');
      }

      throw new Error('Authentication failed');
    }
  },

  /**
   * Sign up a new user with email, password, and optional wrestler name
   */
  signUp: async (
    email: string,
    password: string,
    options?: { wrestlerName?: string }
  ): Promise<{ isConfirmed: boolean; userId?: string }> => {
    try {
      logger.debug('Attempting sign up');

      const userAttributes: Record<string, string> = {
        email,
      };

      if (options?.wrestlerName) {
        userAttributes['custom:wrestler_name'] = options.wrestlerName;
      }

      const result = await signUp({
        username: email,
        password,
        options: {
          userAttributes,
        },
      });

      logger.debug('Sign up completed');

      return {
        isConfirmed: result.isSignUpComplete,
        userId: result.userId,
      };
    } catch (error: unknown) {
      logger.error('Cognito sign up error');

      if (error instanceof Error) {
        const cognitoError = error as Error & { name?: string };
        if (cognitoError.name === 'UsernameExistsException') {
          throw new Error('An account with this email already exists');
        } else if (cognitoError.name === 'InvalidPasswordException') {
          throw new Error('Password does not meet requirements (min 8 chars, uppercase, lowercase, number)');
        }
        throw new Error(error.message || 'Sign up failed');
      }

      throw new Error('Sign up failed');
    }
  },

  /**
   * Confirm sign up with verification code
   */
  confirmSignUp: async (email: string, code: string): Promise<boolean> => {
    try {
      const result = await confirmSignUp({
        username: email,
        confirmationCode: code,
      });
      return result.isSignUpComplete;
    } catch (error: unknown) {
      if (error instanceof Error) {
        const cognitoError = error as Error & { name?: string };
        if (cognitoError.name === 'CodeMismatchException') {
          throw new Error('Invalid verification code');
        } else if (cognitoError.name === 'ExpiredCodeException') {
          throw new Error('Verification code has expired. Please request a new one.');
        }
        throw new Error(error.message || 'Confirmation failed');
      }
      throw new Error('Confirmation failed');
    }
  },

  /**
   * Sign out the current user
   */
  signOut: async (): Promise<void> => {
    try {
      await signOut();
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('idToken');
      sessionStorage.removeItem('userGroups');
    } catch (_error) {
      logger.error('Sign out error');
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('idToken');
      sessionStorage.removeItem('userGroups');
    }
  },

  /**
   * Get the current access token
   */
  getAccessToken: (): string | null => {
    return sessionStorage.getItem('accessToken');
  },

  /**
   * Get the current ID token
   */
  getIdToken: (): string | null => {
    return sessionStorage.getItem('idToken');
  },

  /**
   * Get the current user's groups/roles from session storage
   */
  getUserGroups: (): UserRole[] => {
    try {
      const groups = sessionStorage.getItem('userGroups');
      return groups ? JSON.parse(groups) : [];
    } catch {
      return [];
    }
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated: async (): Promise<boolean> => {
    try {
      const session = await fetchAuthSession();
      return !!session.tokens?.accessToken;
    } catch {
      return false;
    }
  },

  /**
   * Quick sync check using session storage (no async)
   */
  isAuthenticatedSync: (): boolean => {
    return !!sessionStorage.getItem('accessToken');
  },

  /**
   * Check if the current user has a specific role
   */
  hasRole: (role: UserRole): boolean => {
    const groups = cognitoAuth.getUserGroups();
    if (groups.includes('Admin')) return true;
    if (groups.includes('Moderator') && role !== 'Admin') return true;
    return groups.includes(role);
  },

  /**
   * Check if current user is admin
   */
  isAdmin: (): boolean => {
    return cognitoAuth.getUserGroups().includes('Admin');
  },

  /**
   * Check if current user is a wrestler (or admin)
   */
  isWrestler: (): boolean => {
    return cognitoAuth.hasRole('Wrestler');
  },

  /**
   * Get current user info
   */
  getCurrentUser: async () => {
    try {
      const user = await getCurrentUser();
      return user;
    } catch {
      return null;
    }
  },

  /**
   * Initiate forgot password flow — sends a verification code to the user's email
   */
  forgotPassword: async (email: string): Promise<void> => {
    try {
      await resetPassword({ username: email });
    } catch (error: unknown) {
      if (error instanceof Error) {
        const cognitoError = error as Error & { name?: string };
        if (cognitoError.name === 'UserNotFoundException') {
          throw new Error('No account found with this email');
        } else if (cognitoError.name === 'LimitExceededException') {
          throw new Error('Too many attempts. Please try again later.');
        }
        throw new Error(error.message || 'Failed to send reset code');
      }
      throw new Error('Failed to send reset code');
    }
  },

  /**
   * Confirm password reset with verification code and new password
   */
  confirmForgotPassword: async (email: string, code: string, newPassword: string): Promise<void> => {
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        const cognitoError = error as Error & { name?: string };
        if (cognitoError.name === 'CodeMismatchException') {
          throw new Error('Invalid verification code');
        } else if (cognitoError.name === 'ExpiredCodeException') {
          throw new Error('Verification code has expired. Please request a new one.');
        } else if (cognitoError.name === 'InvalidPasswordException') {
          throw new Error('Password does not meet requirements (min 8 chars, uppercase, lowercase, number)');
        }
        throw new Error(error.message || 'Failed to reset password');
      }
      throw new Error('Failed to reset password');
    }
  },

  /**
   * Refresh the session and get new tokens
   */
  refreshSession: async (): Promise<CognitoAuthResult | null> => {
    try {
      const session = await fetchAuthSession({ forceRefresh: true });
      const tokens = session.tokens;

      if (tokens?.accessToken && tokens?.idToken) {
        const accessToken = tokens.accessToken.toString();
        const idToken = tokens.idToken.toString();
        const groups = getGroupsFromToken(accessToken);

        sessionStorage.setItem('accessToken', accessToken);
        sessionStorage.setItem('idToken', idToken);
        sessionStorage.setItem('userGroups', JSON.stringify(groups));

        return {
          accessToken,
          idToken,
          expiresIn: 86400,
          groups,
        };
      }
      return null;
    } catch (_error) {
      logger.error('Session refresh error');
      return null;
    }
  },
};

export default cognitoAuth;
