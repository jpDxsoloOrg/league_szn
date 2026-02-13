import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Hoisted mocks ---
const { mockEventsApi, mockSeasonsApi } = vi.hoisted(() => ({
  mockEventsApi: { getAll: vi.fn(), update: vi.fn() },
  mockSeasonsApi: { getAll: vi.fn() },
}));

vi.mock('../../../services/api', () => ({
  eventsApi: mockEventsApi,
  seasonsApi: mockSeasonsApi,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import ManageFantasyShows from '../ManageFantasyShows';
import type { LeagueEvent } from '../../../types/event';

// --- Test data ---
const mockSeasons = [
  { seasonId: 's1', name: 'Season 1', status: 'active' },
  { seasonId: 's2', name: 'Season 2', status: 'completed' },
];

const mockEvents: LeagueEvent[] = [
  {
    eventId: 'evt-1', name: 'Royal Rumble', eventType: 'ppv', date: '2024-06-15',
    status: 'upcoming', matchCards: [], seasonId: 's1',
    fantasyLocked: false, fantasyBudget: 500, fantasyPicksPerDivision: 2,
    createdAt: '2024-01-01', updatedAt: '2024-01-01',
  },
  {
    eventId: 'evt-2', name: 'WrestleMania', eventType: 'ppv', date: '2024-04-01',
    status: 'completed', matchCards: [], seasonId: 's1',
    fantasyLocked: true, fantasyBudget: 600, fantasyPicksPerDivision: 3,
    createdAt: '2024-01-01', updatedAt: '2024-01-01',
  },
  {
    eventId: 'evt-3', name: 'SummerSlam', eventType: 'ppv', date: '2024-08-01',
    status: 'upcoming', matchCards: [], seasonId: 's2',
    fantasyLocked: true, fantasyBudget: 450, fantasyPicksPerDivision: 2,
    createdAt: '2024-01-01', updatedAt: '2024-01-01',
  },
];

function renderComponent() {
  return render(<ManageFantasyShows />);
}

describe('ManageFantasyShows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventsApi.getAll.mockResolvedValue(mockEvents);
    mockSeasonsApi.getAll.mockResolvedValue(mockSeasons);
  });

  it('renders event list table with event details and season names', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('fantasy.admin.shows.title')).toBeInTheDocument();
    });

    // Event names
    expect(screen.getByText('Royal Rumble')).toBeInTheDocument();
    expect(screen.getByText('WrestleMania')).toBeInTheDocument();
    expect(screen.getByText('SummerSlam')).toBeInTheDocument();

    // Season names resolved from lookup
    const season1Cells = screen.getAllByText('Season 1');
    expect(season1Cells.length).toBe(2); // Royal Rumble + WrestleMania

    // Status badges
    const upcomingBadges = screen.getAllByText('upcoming');
    expect(upcomingBadges.length).toBe(2);
    expect(screen.getByText('completed')).toBeInTheDocument();

    // Table headers
    expect(screen.getByText('fantasy.admin.shows.name')).toBeInTheDocument();
    expect(screen.getByText('fantasy.admin.shows.budget')).toBeInTheDocument();
  });

  it('locks and unlocks events via toggle button', async () => {
    const user = userEvent.setup();

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Royal Rumble')).toBeInTheDocument();
    });

    // Royal Rumble is unlocked — should show "Lock" button (only one lock button)
    const lockBtn = screen.getByText('fantasy.admin.shows.lock');
    const updatedEvent = { ...mockEvents[0], fantasyLocked: true };
    mockEventsApi.update.mockResolvedValue(updatedEvent);
    await user.click(lockBtn);

    await waitFor(() => {
      expect(mockEventsApi.update).toHaveBeenCalledWith('evt-1', { fantasyLocked: true });
    });

    // After lock, Royal Rumble is now also locked — 2 unlock buttons exist
    // Use getAllByText and click the SummerSlam one (second in order)
    await waitFor(() => {
      const unlockBtns = screen.getAllByText('fantasy.admin.shows.unlock');
      expect(unlockBtns.length).toBe(2);
    });

    const unlockBtns = screen.getAllByText('fantasy.admin.shows.unlock');
    const unlockedEvent = { ...mockEvents[2], fantasyLocked: false };
    mockEventsApi.update.mockResolvedValue(unlockedEvent);
    // Click the second unlock button (SummerSlam row)
    await user.click(unlockBtns[1]);

    await waitFor(() => {
      expect(mockEventsApi.update).toHaveBeenCalledWith('evt-3', { fantasyLocked: false });
    });
  });

  it('shows closed badge for completed events instead of lock/unlock button', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('WrestleMania')).toBeInTheDocument();
    });

    // Completed event shows "closed" badge, not a button
    expect(screen.getByText('fantasy.admin.shows.closed')).toBeInTheDocument();

    // Lock/unlock buttons only for non-completed events (2 events: Royal Rumble and SummerSlam)
    const actionButtons = [
      ...screen.queryAllByText('fantasy.admin.shows.lock'),
      ...screen.queryAllByText('fantasy.admin.shows.unlock'),
    ];
    expect(actionButtons.length).toBe(2); // One lock (Royal Rumble) + one unlock (SummerSlam)
  });
});
