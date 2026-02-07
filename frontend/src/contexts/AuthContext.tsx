import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { cognitoAuth, type UserRole } from '../services/cognito';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  groups: UserRole[];
  email: string | null;
}

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, options?: { wrestlerName?: string }) => Promise<{ isConfirmed: boolean }>;
  confirmSignUp: (email: string, code: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isWrestler: boolean;
  isFantasy: boolean;
  hasRole: (role: UserRole) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: cognitoAuth.isAuthenticatedSync(),
    isLoading: true,
    groups: cognitoAuth.getUserGroups(),
    email: null,
  });

  // Initialize auth state on mount
  useEffect(() => {
    const init = async () => {
      try {
        const user = await cognitoAuth.getCurrentUser();
        if (user) {
          // Refresh tokens to get latest groups
          const session = await cognitoAuth.refreshSession();
          setState({
            isAuthenticated: true,
            isLoading: false,
            groups: session?.groups || cognitoAuth.getUserGroups(),
            email: user.signInDetails?.loginId || user.username || null,
          });
        } else {
          setState({
            isAuthenticated: false,
            isLoading: false,
            groups: [],
            email: null,
          });
        }
      } catch {
        setState({
          isAuthenticated: false,
          isLoading: false,
          groups: [],
          email: null,
        });
      }
    };
    init();
  }, []);

  const handleSignIn = useCallback(async (email: string, password: string) => {
    const result = await cognitoAuth.signIn(email, password);
    setState({
      isAuthenticated: true,
      isLoading: false,
      groups: result.groups,
      email,
    });
  }, []);

  const handleSignUp = useCallback(async (email: string, password: string, options?: { wrestlerName?: string }) => {
    return cognitoAuth.signUp(email, password, options);
  }, []);

  const handleConfirmSignUp = useCallback(async (email: string, code: string) => {
    return cognitoAuth.confirmSignUp(email, code);
  }, []);

  const handleSignOut = useCallback(async () => {
    await cognitoAuth.signOut();
    setState({
      isAuthenticated: false,
      isLoading: false,
      groups: [],
      email: null,
    });
  }, []);

  const hasRole = useCallback((role: UserRole): boolean => {
    if (state.groups.includes('Admin')) return true;
    return state.groups.includes(role);
  }, [state.groups]);

  const value: AuthContextType = {
    ...state,
    signIn: handleSignIn,
    signUp: handleSignUp,
    confirmSignUp: handleConfirmSignUp,
    signOut: handleSignOut,
    isAdmin: state.groups.includes('Admin'),
    isWrestler: hasRole('Wrestler'),
    isFantasy: hasRole('Fantasy'),
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
