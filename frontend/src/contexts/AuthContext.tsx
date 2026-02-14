import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { cognitoAuth, type UserRole } from '../services/cognito';
import { profileApi } from '../services/api';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  groups: UserRole[];
  email: string | null;
  playerId: string | null;
}

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, options?: { wrestlerName?: string }) => Promise<{ isConfirmed: boolean }>;
  confirmSignUp: (email: string, code: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  devSignIn?: (player: { playerId: string; name: string }) => void;
  isAdminOrModerator: boolean;
  isSuperAdmin: boolean;
  isModerator: boolean;
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
    playerId: null,
  });

  // Initialize auth state on mount
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Dev mode: restore dev session from sessionStorage
      if (import.meta.env.DEV) {
        const devPlayer = sessionStorage.getItem('devPlayer');
        if (devPlayer) {
          try {
            const player = JSON.parse(devPlayer);
            if (!mounted) return;
            setState({
              isAuthenticated: true,
              isLoading: false,
              groups: ['Wrestler'],
              email: `${(player.name as string).toLowerCase().replace(/\s/g, '.')}@dev.local`,
              playerId: player.playerId,
            });
            return;
          } catch {
            sessionStorage.removeItem('devPlayer');
          }
        }
      }

      try {
        const user = await cognitoAuth.getCurrentUser();
        if (!mounted) return;

        if (user) {
          // Refresh tokens to get latest groups
          const session = await cognitoAuth.refreshSession();
          if (!mounted) return;

          const groups = session?.groups || cognitoAuth.getUserGroups();

          // Fetch player profile if user is in the Wrestler group
          let playerId: string | null = null;
          if (groups.includes('Wrestler')) {
            try {
              const profile = await profileApi.getMyProfile();
              if (!mounted) return;
              playerId = profile.playerId;
            } catch {
              // Profile may not exist yet
            }
          }

          if (!mounted) return;
          setState({
            isAuthenticated: true,
            isLoading: false,
            groups,
            email: user.signInDetails?.loginId || user.username || null,
            playerId,
          });
        } else {
          setState({
            isAuthenticated: false,
            isLoading: false,
            groups: [],
            email: null,
            playerId: null,
          });
        }
      } catch {
        if (!mounted) return;
        setState({
          isAuthenticated: false,
          isLoading: false,
          groups: [],
          email: null,
          playerId: null,
        });
      }
    };
    init();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSignIn = useCallback(async (email: string, password: string) => {
    const result = await cognitoAuth.signIn(email, password);

    // Fetch player profile if user is in the Wrestler group
    let playerId: string | null = null;
    if (result.groups.includes('Wrestler')) {
      try {
        const profile = await profileApi.getMyProfile();
        playerId = profile.playerId;
      } catch {
        // Profile may not exist yet
      }
    }

    setState({
      isAuthenticated: true,
      isLoading: false,
      groups: result.groups,
      email,
      playerId,
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
    sessionStorage.removeItem('devPlayer');
    setState({
      isAuthenticated: false,
      isLoading: false,
      groups: [],
      email: null,
      playerId: null,
    });
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await profileApi.getMyProfile();
      setState(prev => ({ ...prev, playerId: profile.playerId }));
    } catch {
      // Profile may not exist
    }
  }, []);

  const hasRole = useCallback((role: UserRole): boolean => {
    if (state.groups.includes('Admin')) return true;
    if (state.groups.includes('Moderator') && role !== 'Admin') return true;
    return state.groups.includes(role);
  }, [state.groups]);

  // Dev-only: sign in as a player without Cognito
  const devSignIn = useCallback((player: { playerId: string; name: string }) => {
    sessionStorage.setItem('accessToken', `dev-${player.playerId}`);
    sessionStorage.setItem('userGroups', JSON.stringify(['Wrestler']));
    sessionStorage.setItem('devPlayer', JSON.stringify(player));
    setState({
      isAuthenticated: true,
      isLoading: false,
      groups: ['Wrestler'],
      email: `${player.name.toLowerCase().replace(/\s/g, '.')}@dev.local`,
      playerId: player.playerId,
    });
  }, []);

  const value: AuthContextType = {
    ...state,
    signIn: handleSignIn,
    signUp: handleSignUp,
    confirmSignUp: handleConfirmSignUp,
    signOut: handleSignOut,
    refreshProfile,
    ...(import.meta.env.DEV ? { devSignIn } : {}),
    isAdminOrModerator: state.groups.includes('Admin') || state.groups.includes('Moderator'),
    isSuperAdmin: state.groups.includes('Admin'),
    isModerator: state.groups.includes('Moderator'),
    isWrestler: state.groups.includes('Wrestler'),
    isFantasy: hasRole('Fantasy'),
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
