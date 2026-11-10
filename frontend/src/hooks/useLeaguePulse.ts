import { useEffect, useState } from 'react';
import { announcementsApi, dashboardApi } from '../services/api';
import type { Announcement, DashboardData } from '../types';
import { waitForPageRequests } from '../utils/deferShellRequest';

/** What the shell shows about the league right now: the status strip and the ticker. */
export interface LeaguePulse {
  dashboard: DashboardData | null;
  news: Announcement[];
}

const EMPTY_PULSE: LeaguePulse = { dashboard: null, news: [] };

/** The shell reuses one answer for this long, so moving between pages adds no requests. */
export const PULSE_MAX_AGE_MS = 5 * 60 * 1000;

let cached: { loadedAt: number; request: Promise<LeaguePulse> } | null = null;

async function loadPulse(): Promise<LeaguePulse> {
  const [dashboard, news] = await Promise.allSettled([dashboardApi.get(), announcementsApi.getActive()]);
  return {
    dashboard: dashboard.status === 'fulfilled' ? dashboard.value : null,
    news: news.status === 'fulfilled' ? news.value : [],
  };
}

function getPulse(): Promise<LeaguePulse> {
  if (!cached || Date.now() - cached.loadedAt > PULSE_MAX_AGE_MS) {
    cached = { loadedAt: Date.now(), request: loadPulse() };
  }
  return cached.request;
}

/** Test hook: forget the shared answer. */
export function resetLeaguePulse(): void {
  cached = null;
}

/**
 * League data for the shell chrome. It waits for the page's own requests, is
 * shared by every caller, and stays empty when the API fails: the chrome is an
 * extra and must never block or break a page.
 */
export function useLeaguePulse(): LeaguePulse {
  const [pulse, setPulse] = useState<LeaguePulse>(EMPTY_PULSE);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      await waitForPageRequests(controller.signal);
      if (controller.signal.aborted) return;
      const next = await getPulse();
      if (!controller.signal.aborted) setPulse(next);
    };

    void load();
    return () => controller.abort();
  }, []);

  return pulse;
}
