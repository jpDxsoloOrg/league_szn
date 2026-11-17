import { useEffect, useState } from 'react';
import { tickerApi } from '../services/api';
import type { TickerFeedSegment } from '../services/api';
import { waitForPageRequests } from '../utils/deferShellRequest';

/** The ticker reloads this often while the tab is visible. */
export const TICKER_REFRESH_MS = 2 * 60 * 1000;

export interface TickerFeedState {
  segments: TickerFeedSegment[];
  /** False until the first answer (or failure), so the strip can hold its height. */
  loaded: boolean;
}

/** The last answer, so a remount (leaving an admin page) does not refetch at once. */
let lastFeed: { loadedAt: number; segments: TickerFeedSegment[] } | null = null;

/** Test hook: forget the last answer. */
export function resetTickerFeed(): void {
  lastFeed = null;
}

function isTabVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/**
 * The league ticker feed from `GET /ticker`. The first load waits for the
 * page's own requests; after that it refreshes every two minutes while the
 * tab is visible, and once on return to the tab if it went stale. A failed
 * load keeps what was showing: the ticker is an extra and must never break a page.
 * With `enabled` false it loads nothing.
 */
export function useTickerFeed(enabled: boolean): TickerFeedState {
  const [state, setState] = useState<TickerFeedState>(() =>
    lastFeed ? { segments: lastFeed.segments, loaded: true } : { segments: [], loaded: false });

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let inFlight = false;

    const load = async () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const feed = await tickerApi.get(controller.signal);
        if (controller.signal.aborted) return;
        const segments = Array.isArray(feed?.segments) ? feed.segments : [];
        lastFeed = { loadedAt: Date.now(), segments };
        setState({ segments, loaded: true });
      } catch {
        if (!controller.signal.aborted) setState((previous) => ({ ...previous, loaded: true }));
      } finally {
        inFlight = false;
      }
    };

    const isStale = () => !lastFeed || Date.now() - lastFeed.loadedAt >= TICKER_REFRESH_MS;

    const start = async () => {
      if (!isStale()) return;
      await waitForPageRequests(controller.signal);
      await load();
    };
    void start();

    const timer = window.setInterval(() => {
      if (isTabVisible()) void load();
    }, TICKER_REFRESH_MS);

    const onVisibility = () => {
      if (isTabVisible() && isStale()) void load();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);

  return state;
}
