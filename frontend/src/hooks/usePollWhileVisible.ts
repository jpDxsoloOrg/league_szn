import { useEffect, useRef } from 'react';

/**
 * Runs `callback` every `intervalMs`, but only while the tab is visible.
 * Coming back to the tab runs it straight away so the page is never stale.
 * Each poll is a paid Lambda call, and a forgotten tab would otherwise poll all day.
 */
export const usePollWhileVisible = (
  callback: () => void,
  intervalMs: number,
  enabled = true,
): void => {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let intervalId: number | null = null;

    const stop = (): void => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const start = (): void => {
      stop();
      intervalId = window.setInterval(() => callbackRef.current(), intervalMs);
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        callbackRef.current();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') {
      start();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs, enabled]);
};
