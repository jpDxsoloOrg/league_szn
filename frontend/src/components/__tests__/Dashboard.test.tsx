import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { mockGetDashboard } = vi.hoisted(() => ({
  mockGetDashboard: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  dashboardApi: { get: mockGetDashboard },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'dashboard.title': 'League Overview',
        'dashboard.champions': 'Current Champions',
        'dashboard.upcomingEvents': 'Upcoming Events',
        'dashboard.recentResults': 'Recent Results',
        'dashboard.seasonProgress': 'Season Progress',
        'dashboard.quickStats': 'Quick Stats',
        'dashboard.activeChallenges': 'Active Challenges',
        'dashboard.viewAll': 'View All',
        'dashboard.noChampions': 'No active champions',
        'dashboard.noUpcomingEvents': 'No upcoming events',
        'dashboard.noRecentResults': 'No recent results',
        'dashboard.noActiveSeason': 'No active season',
        'dashboard.mostWins': 'Most Wins',
        'dashboard.matchesPlayed': 'Matches Played',
        'dashboard.seasonStart': 'Season Start',
        'dashboard.countdown.days': 'd',
        'dashboard.countdown.hours': 'h',
        'dashboard.countdown.minutes': 'm',
        'dashboard.vs': 'vs',
        'standings.table.player': 'Player',
        'common.retry': 'Retry',
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock('../Dashboard.css', () => ({}));

import Dashboard from '../Dashboard';

const emptyDashboard = {
  currentChampions: [],
  upcomingEvents: [],
  recentResults: [],
  seasonInfo: null,
  quickStats: {
    totalPlayers: 0,
    totalMatches: 0,
    activeChampionships: 0,
  },
  activeChallengesCount: 0,
};

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDashboard.mockResolvedValue(emptyDashboard);
  });

  it('renders loading state initially then shows content after load', async () => {
    let resolve: (value: typeof emptyDashboard) => void;
    mockGetDashboard.mockImplementation(
      () => new Promise((r) => { resolve = r; })
    );

    renderDashboard();

    expect(screen.getByText('League Overview')).toBeInTheDocument();
    resolve!(emptyDashboard);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Current Champions' })).toBeInTheDocument();
    });
  });

  it('renders all dashboard sections after data loads', async () => {
    const dataWithContent = {
      ...emptyDashboard,
      currentChampions: [
        { championshipId: 'c1', championshipName: 'World', championName: 'Alice', playerId: 'p1' },
      ],
      upcomingEvents: [
        { eventId: 'e1', name: 'WrestleMania', date: '2025-04-01', eventType: 'ppv' },
      ],
      recentResults: [
        { matchId: 'm1', date: '2025-01-15', matchType: 'singles', winnerName: 'Alice', loserName: 'Bob' },
      ],
      seasonInfo: { seasonId: 's1', name: 'Season 1', status: 'active', matchesPlayed: 10 },
      quickStats: { ...emptyDashboard.quickStats, totalPlayers: 5, totalMatches: 20, mostWinsPlayer: { name: 'Alice', wins: 8 } },
    };
    mockGetDashboard.mockResolvedValue(dataWithContent);

    renderDashboard();

    await waitFor(
      () => {
        expect(screen.getByText('WrestleMania')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
    expect(screen.getByText('League Overview')).toBeInTheDocument();
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
    expect(screen.getByText('World')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Season 1')).toBeInTheDocument();
    expect(screen.getByText('View All')).toBeInTheDocument();
  });

  it('renders empty states when no data', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('No active champions')).toBeInTheDocument();
    });
    expect(screen.getByText('No upcoming events')).toBeInTheDocument();
    expect(screen.getByText('No recent results')).toBeInTheDocument();
    expect(screen.getByText('No active season')).toBeInTheDocument();
  });

  it('handles API error and shows retry button', async () => {
    mockGetDashboard.mockRejectedValue(new Error('Network error'));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    mockGetDashboard.mockResolvedValue(emptyDashboard);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(
      () => {
        expect(screen.getByRole('heading', { name: 'Current Champions' })).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });
});
