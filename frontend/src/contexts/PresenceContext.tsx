import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { matchmakingApi } from '../services/api/matchmaking.api';

const SESSION_STORAGE_KEY = 'wwe2k.presenceEnabled';
const HEARTBEAT_INTERVAL_MS = 60_000;

interface PresenceContextValue {
  presenceEnabled: boolean;
  enablePresence: () => Promise<void>;
  disablePresence: () => Promise<void>;
  lastHeartbeatAt: Date | null;
}

// eslint-disable-next-line react-refresh/only-export-components
export const PresenceContext = createContext<PresenceContextValue | undefined>(undefined);

const readInitialPresenceEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

export const PresenceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, isWrestler, playerId } = useAuth();

  const [presenceEnabled, setPresenceEnabled] = useState<boolean>(readInitialPresenceEnabled);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<Date | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendHeartbeat = useCallback(async (): Promise<void> => {
    try {
      await matchmakingApi.heartbeat();
      setLastHeartbeatAt(new Date());
    } catch (error) {
      // Transient errors should not make the user disappear. Log and continue.
      console.error('[PresenceContext] heartbeat failed', error);
    }
  }, []);

  const enablePresence = useCallback(async (): Promise<void> => {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, 'true');
      } catch (error) {
        console.error('[PresenceContext] failed to persist presenceEnabled', error);
      }
    }
    setPresenceEnabled(true);
    await sendHeartbeat();
  }, [sendHeartbeat]);

  const disablePresence = useCallback(async (): Promise<void> => {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      } catch (error) {
        console.error('[PresenceContext] failed to clear presenceEnabled', error);
      }
    }
    setPresenceEnabled(false);
    setLastHeartbeatAt(null);
    try {
      await matchmakingApi.leavePresence();
    } catch (error) {
      console.error('[PresenceContext] leavePresence failed', error);
    }
  }, []);

  // Heartbeat loop + visibility/unload listeners
  useEffect(() => {
    if (!presenceEnabled || !isAuthenticated || !isWrestler || !playerId) {
      return;
    }

    let cancelled = false;

    const fireHeartbeat = (): void => {
      if (cancelled) return;
      void sendHeartbeat();
    };

    // Immediate heartbeat
    fireHeartbeat();

    // Recurring heartbeat
    intervalRef.current = setInterval(fireHeartbeat, HEARTBEAT_INTERVAL_MS);

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        fireHeartbeat();
      }
    };

    const handleBeforeUnload = (): void => {
      // Best-effort cleanup. sendBeacon can't do DELETE, so we fire-and-forget
      // leavePresence. Server-side TTL (5 minutes) handles the fallback.
      try {
        void matchmakingApi.leavePresence();
      } catch (error) {
        console.error('[PresenceContext] beforeunload leavePresence failed', error);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [presenceEnabled, isAuthenticated, isWrestler, playerId, sendHeartbeat]);

  // Auto-disable on sign-out
  useEffect(() => {
    if (!isAuthenticated && presenceEnabled) {
      void disablePresence();
    }
  }, [isAuthenticated, presenceEnabled, disablePresence]);

  const value: PresenceContextValue = {
    presenceEnabled,
    enablePresence,
    disablePresence,
    lastHeartbeatAt,
  };

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const usePresence = (): PresenceContextValue => {
  const ctx = useContext(PresenceContext);
  if (!ctx) {
    throw new Error('usePresence must be used within PresenceProvider');
  }
  return ctx;
};
