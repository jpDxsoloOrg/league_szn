import { useEffect, useReducer } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { MAX_TIMER_MS, isBlockedNow } from '../utils/discipline';

export interface SignupBlock {
  blocked: boolean;
  /** When the block lifts. Null when there is none. */
  until: string | null;
}

/**
 * The signed-in player's sign-up block. Re-renders once, when the block ends,
 * rather than on a tick, because large pages use this.
 */
export function useSignupBlock(): SignupBlock {
  const { profile } = useAuth();
  const discipline = profile?.discipline;
  const until = discipline?.signupBlockedUntil ?? null;
  const [, recheck] = useReducer((checks: number) => checks + 1, 0);

  useEffect(() => {
    if (until === null) return undefined;
    const delay = Date.parse(until) - Date.now();
    if (delay <= 0) return undefined;
    const timer = window.setTimeout(recheck, Math.min(delay, MAX_TIMER_MS));
    return () => window.clearTimeout(timer);
  }, [until]);

  const blocked = isBlockedNow(discipline);
  return { blocked, until: blocked ? until : null };
}
