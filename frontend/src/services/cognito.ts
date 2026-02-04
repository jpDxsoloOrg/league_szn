import { Amplify } from 'aws-amplify';
import { signIn, signOut, fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';

// Cognito configuration from environment variables
const cognitoConfig = {
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
  userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
  region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
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
}

export const cognitoAuth = {
  /**
   * Sign in with username and password
   */
  signIn: async (username: string, password: string): Promise<CognitoAuthResult> => {
    try {
      console.log('Attempting sign in for:', username);
      console.log('Cognito config:', {
        userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
        clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      });

      const result = await signIn({
        username,
        password,
      });

      console.log('Sign in result:', result);

      if (result.isSignedIn) {
        const session = await fetchAuthSession();
        const tokens = session.tokens;

        if (!tokens?.accessToken || !tokens?.idToken) {
          throw new Error('Failed to get authentication tokens');
        }

        const accessToken = tokens.accessToken.toString();
        const idToken = tokens.idToken.toString();

        // Store tokens in session storage
        sessionStorage.setItem('accessToken', accessToken);
        sessionStorage.setItem('idToken', idToken);

        return {
          accessToken,
          idToken,
          expiresIn: 86400, // 24 hours
        };
      }

      // Handle different sign-in states
      const nextStep = result.nextStep?.signInStep;
      if (nextStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        throw new Error('Password change required. Please contact administrator.');
      } else if (nextStep === 'CONFIRM_SIGN_UP') {
        throw new Error('Account not confirmed. Please contact administrator.');
      } else if (nextStep) {
        throw new Error(`Additional step required: ${nextStep}`);
      }

      throw new Error('Sign in failed - unexpected state');
    } catch (error: any) {
      console.error('Cognito sign in error:', error);

      // Handle specific Cognito errors
      if (error.name === 'NotAuthorizedException') {
        throw new Error('Invalid username or password');
      } else if (error.name === 'UserNotFoundException') {
        throw new Error('User not found');
      } else if (error.name === 'UserNotConfirmedException') {
        throw new Error('User not confirmed');
      }

      throw new Error(error.message || 'Authentication failed');
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
    } catch (error) {
      console.error('Sign out error:', error);
      // Clear tokens anyway
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('idToken');
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
   * Refresh the session and get new tokens
   */
  refreshSession: async (): Promise<CognitoAuthResult | null> => {
    try {
      const session = await fetchAuthSession({ forceRefresh: true });
      const tokens = session.tokens;

      if (tokens?.accessToken && tokens?.idToken) {
        const accessToken = tokens.accessToken.toString();
        const idToken = tokens.idToken.toString();

        sessionStorage.setItem('accessToken', accessToken);
        sessionStorage.setItem('idToken', idToken);

        return {
          accessToken,
          idToken,
          expiresIn: 86400,
        };
      }
      return null;
    } catch (error) {
      console.error('Session refresh error:', error);
      return null;
    }
  },
};

export default cognitoAuth;
