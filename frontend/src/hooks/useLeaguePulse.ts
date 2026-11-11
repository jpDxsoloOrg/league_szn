import { useEffect, useState } from 'react';
import { announcementsApi, dashboardApi, eventsApi } from '../services/api';
import type { Announcement, DashboardData } from '../types';
import type { EventWithMatches, LeagueEvent } from '../types/event';
import { toCalendarDate } from '../utils/dateUtils';
import { waitForPageRequests } from '../utils/deferShellRequest';

/** What the shell shows about the league right now: the status strip and the ticker. */
export interface LeaguePulse {
  dashboard: DashboardData | null;
  news: Announcement[];
  /** Shows still to come or under way, soonest first. */
  upcomingShows: LeagueEvent[];
  /** The latest finished shows with their cards, newest first. */
  recentShows: EventWithMatches[];
}

const EMPTY_PULSE: LeaguePulse = { dashboard: null, news: [], upcomingShows: [], recentShows: [] };

/** The shell reuses one answer for this long, so moving between pages adds no requests. */
export const PULSE_MAX_AGE_MS = 5 * 60 * 1000;
export const UPCOMING_SHOWS_SHOWN = 3;
/** The latest show plus the one before it on each night of the Monday, Wednesday, Friday rotation. */
export const RECENT_SHOWS_SHOWN = 4;

let cached: { loadedAt: number; request: Promise<LeaguePulse> } | null = null;

function byDate(first: LeagueEvent, second: LeagueEvent): number {
  return toCalendarDate(first.date).localeCompare(toCalendarDate(second.date));
}

/** One finished show's card. A show that fails to load is left out, not fatal. */
async function loadShow(eventId: string): Promise<EventWithMatches | null> {
  try {
    return await eventsApi.getById(eventId);
  } catch {
    return null;
  }
}

async function loadPulse(): Promise<LeaguePulse> {
  const [dashboard, news, events] = await Promise.allSettled([
    dashboardApi.get(),
    announcementsApi.getActive(),
    eventsApi.getAll(),
  ]);
  const allEvents = events.status === 'fulfilled' ? events.value : [];

  const upcomingShows = allEvents
    .filter((event) => event.status === 'upcoming' || event.status === 'in-progress')
    .sort(byDate)
    .slice(0, UPCOMING_SHOWS_SHOWN);
  const finished = allEvents
    .filter((event) => event.status === 'completed')
    .sort((first, second) => byDate(second, first))
    .slice(0, RECENT_SHOWS_SHOWN);

  // One at a time: the account allows few concurrent Lambdas.
  const recentShows: EventWithMatches[] = [];
  for (const event of finished) {
    const show = await loadShow(event.eventId);
    if (show) recentShows.push(show);
  }

  return {
    dashboard: dashboard.status === 'fulfilled' ? dashboard.value : null,
    news: news.status === 'fulfilled' ? news.value : [],
    upcomingShows,
    recentShows,
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
