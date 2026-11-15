import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { mockDashboard, mockNews, mockEvents, mockEvent, mockCallUps } = vi.hoisted(() => ({
  mockCallUps: vi.fn(),
  mockDashboard: vi.fn(),
  mockNews: vi.fn(),
  mockEvents: vi.fn(),
  mockEvent: vi.fn(),
}));

vi.mock('../services/api', () => ({
  dashboardApi: { get: mockDashboard },
  announcementsApi: { getActive: mockNews },
  eventsApi: { getAll: mockEvents, getById: mockEvent },
  progressionApi: { getConsiderations: mockCallUps },
}));
vi.mock('../utils/deferShellRequest', () => ({ waitForPageRequests: () => Promise.resolve() }));

import { resetLeaguePulse, useLeaguePulse } from './useLeaguePulse';

function show(eventId: string, date: string, status: string) {
  return { eventId, name: eventId, date, status, matchCards: [] };
}

beforeEach(() => {
  resetLeaguePulse();
  mockDashboard.mockReset().mockResolvedValue({ seasonInfo: null });
  mockCallUps.mockReset().mockResolvedValue([{ playerId: 'p1', name: 'Kilian', wrestlerName: 'Phoenix Jax', trackId: 't1', markedAt: '2026-11-15' }]);
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
  it('lists upcoming shows soonest first and loads only the latest finished show', async () => {
    const { result } = renderHook(() => useLeaguePulse());
    await waitFor(() => expect(result.current.recentShows).toHaveLength(1));

    expect(result.current.upcomingShows.map((event) => event.eventId)).toEqual(['next', 'later']);
    expect(result.current.recentShows.map((event) => event.eventId)).toEqual(['newest']);
    expect(result.current.news).toHaveLength(1);
    expect(result.current.callUps.map((entry) => entry.playerId)).toEqual(['p1']);
    expect(mockCallUps).toHaveBeenCalledWith('callup');
    expect(mockEvent).toHaveBeenCalledTimes(1);
  });

  it('shares one answer between callers', async () => {
    const first = renderHook(() => useLeaguePulse());
    const second = renderHook(() => useLeaguePulse());
    await waitFor(() => expect(first.result.current.recentShows).toHaveLength(1));
    await waitFor(() => expect(second.result.current.recentShows).toHaveLength(1));
    expect(mockEvents).toHaveBeenCalledTimes(1);
  });

  it('keeps what loaded when a request fails, falling back to the show before the latest', async () => {
    mockDashboard.mockRejectedValue(new Error('down'));
    mockCallUps.mockRejectedValue(new Error('down'));
    mockEvent.mockImplementation((eventId: string) =>
      eventId === 'newest' ? Promise.reject(new Error('down')) : Promise.resolve({ ...show(eventId, '', 'completed'), enrichedMatches: [] }));
    const { result } = renderHook(() => useLeaguePulse());
    await waitFor(() => expect(result.current.recentShows).toHaveLength(1));

    expect(result.current.dashboard).toBeNull();
    expect(result.current.callUps).toEqual([]);
    expect(result.current.recentShows[0]?.eventId).toBe('newer');
    expect(result.current.upcomingShows).toHaveLength(2);
  });
});
