import { useEffect, useState } from 'react';

/** The clock, re-read every `intervalMs`, so a countdown stays right in a throttled tab. */
export function useNow(intervalMs: number = 1000, active: boolean = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(intervalId);
  }, [intervalMs, active]);

  return now;
}
