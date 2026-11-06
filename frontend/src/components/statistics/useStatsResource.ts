import { useCallback, useEffect, useState } from 'react';

interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  failed: boolean;
}

/**
 * Runs `load` on mount and whenever it changes, so wrap it in useCallback.
 * Superseded requests are aborted and never touch state. `data` keeps its last
 * value during a reload; pages decide whether to show it or a skeleton.
 */
export function useStatsResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<ResourceState<T>>({ data: null, loading: true, failed: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      setState((previous) => ({ ...previous, loading: true, failed: false }));
      try {
        const data = await load(controller.signal);
        if (!controller.signal.aborted) setState({ data, loading: false, failed: false });
      } catch {
        if (!controller.signal.aborted) setState((previous) => ({ ...previous, loading: false, failed: true }));
      }
    };
    run();
    return () => controller.abort();
  }, [load, attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);

  return { ...state, reload };
}
