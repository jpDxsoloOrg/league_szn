import { useEffect, useRef } from 'react';

/**
 * Runs `callback` straight away and then every `intervalMs` while `enabled`.
 * Polling stops while the tab is hidden and catches up as soon as it is
 * visible again, so background tabs cost no requests. A tick is skipped when
 * the previous one is still in flight, so slow responses cannot pile up.
 */
export function useVisiblePolling(
  callback: () => Promise<void>,
  intervalMs: number,
  enabled: boolean,
): void {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return undefined;

    let intervalId: number | undefined;
    let inFlight = false;

    const tick = async (): Promise<void> => {
      if (inFlight) return;
      inFlight = true;
      try {
        await callbackRef.current();
      } finally {
        inFlight = false;
      }
    };

    const start = (): void => {
      if (intervalId !== undefined) return;
      void tick();
      intervalId = window.setInterval(() => void tick(), intervalMs);
    };

    const stop = (): void => {
      window.clearInterval(intervalId);
      intervalId = undefined;
    };

    const handleVisibilityChange = (): void => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, intervalMs]);
}
