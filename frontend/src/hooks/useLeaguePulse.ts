import { useEffect, useState } from 'react';
import { dashboardApi } from '../services/api';
import type { DashboardData } from '../types';
import { waitForPageRequests } from '../utils/deferShellRequest';

/**
 * What the shell's status strip shows about the league right now. The ticker
 * reads its own feed (`useTickerFeed`).
 */
export interface LeaguePulse {
  dashboard: DashboardData | null;
}

const EMPTY_PULSE: LeaguePulse = { dashboard: null };

/** The shell reuses one answer for this long, so moving between pages adds no requests. */
export const PULSE_MAX_AGE_MS = 5 * 60 * 1000;

let cached: { loadedAt: number; request: Promise<LeaguePulse> } | null = null;

async function loadPulse(): Promise<LeaguePulse> {
  try {
    return { dashboard: await dashboardApi.get() };
  } catch {
    return EMPTY_PULSE;
  }
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
