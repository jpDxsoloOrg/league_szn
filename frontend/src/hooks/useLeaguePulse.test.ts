import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { mockDashboard, mockNews, mockEvents, mockEvent } = vi.hoisted(() => ({
  mockDashboard: vi.fn(),
  mockNews: vi.fn(),
  mockEvents: vi.fn(),
  mockEvent: vi.fn(),
}));

vi.mock('../services/api', () => ({
  dashboardApi: { get: mockDashboard },
  announcementsApi: { getActive: mockNews },
  eventsApi: { getAll: mockEvents, getById: mockEvent },
}));
vi.mock('../utils/deferShellRequest', () => ({ waitForPageRequests: () => Promise.resolve() }));

import { resetLeaguePulse, useLeaguePulse } from './useLeaguePulse';

function show(eventId: string, date: string, status: string) {
  return { eventId, name: eventId, date, status, matchCards: [] };
}

beforeEach(() => {
  resetLeaguePulse();
  mockDashboard.mockReset().mockResolvedValue({ seasonInfo: null });
  mockNews.mockReset().mockResolvedValue([{ announcementId: 'a1' }]);
  mockEvents.mockReset().mockResolvedValue([
    show('oldest', '2026-09-01', 'completed'),
    show('old', '2026-10-01', 'completed'),
    show('older', '2026-10-30', 'completed'),
    show('newest', '2026-11-04', 'completed'),
    show('newer', '2026-11-02T04:00:00.000Z', 'completed'),
    show('off', '2026-11-05', 'cancelled'),
    show('later', '2026-11-16', 'upcoming'),
    show('next', '2026-11-09', 'upcoming'),
  ]);
  mockEvent.mockReset().mockImplementation((eventId: string) => Promise.resolve({ ...show(eventId, '', 'completed'), enrichedMatches: [] }));
});

describe('useLeaguePulse', () => {
  it('lists upcoming shows soonest first and loads the four latest finished shows, newest first', async () => {
    const { result } = renderHook(() => useLeaguePulse());
    await waitFor(() => expect(result.current.recentShows).toHaveLength(4));

    expect(result.current.upcomingShows.map((event) => event.eventId)).toEqual(['next', 'later']);
    expect(result.current.recentShows.map((event) => event.eventId)).toEqual(['newest', 'newer', 'older', 'old']);
    expect(result.current.news).toHaveLength(1);
    expect(mockEvent).toHaveBeenCalledTimes(4);
  });

  it('shares one answer between callers', async () => {
    const first = renderHook(() => useLeaguePulse());
    const second = renderHook(() => useLeaguePulse());
    await waitFor(() => expect(first.result.current.recentShows).toHaveLength(4));
    await waitFor(() => expect(second.result.current.recentShows).toHaveLength(4));
    expect(mockEvents).toHaveBeenCalledTimes(1);
  });

  it('keeps what loaded when a request fails', async () => {
    mockDashboard.mockRejectedValue(new Error('down'));
    mockEvent.mockImplementation((eventId: string) =>
      eventId === 'newest' ? Promise.reject(new Error('down')) : Promise.resolve({ ...show(eventId, '', 'completed'), enrichedMatches: [] }));
    const { result } = renderHook(() => useLeaguePulse());
    await waitFor(() => expect(result.current.recentShows).toHaveLength(3));

    expect(result.current.dashboard).toBeNull();
    expect(result.current.recentShows[0]?.eventId).toBe('newer');
    expect(result.current.upcomingShows).toHaveLength(2);
  });
});
