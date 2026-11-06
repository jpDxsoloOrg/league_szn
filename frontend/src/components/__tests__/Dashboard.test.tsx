import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { mockGetDashboard, mockGetEvent, mockGetAllEvents, mockGetAllShows, mockGetStandings } = vi.hoisted(() => ({
  mockGetDashboard: vi.fn(),
  mockGetEvent: vi.fn(),
  mockGetAllEvents: vi.fn(),
  mockGetAllShows: vi.fn(),
  mockGetStandings: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  dashboardApi: { get: mockGetDashboard },
  eventsApi: { getById: mockGetEvent, getAll: mockGetAllEvents },
  showsApi: { getAll: mockGetAllShows },
  standingsApi: { get: mockGetStandings },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOpts?: string | Record<string, unknown>) => {
      const map: Record<string, string> = {
        'nav.dashboard': 'Dashboard',
        'dashboard.whatsHappening': "What's Happening",
        'dashboard.upcomingEvents': 'Upcoming Events',
        'dashboard.recentResults': 'Recent Results',
        'dashboard.seasonProgress': 'Season Progress',
        'dashboard.quickStats': 'Quick Stats',
        'dashboard.activeChallenges': 'Active Challenges',
        'dashboard.viewChallenges': 'View Challenges',
        'dashboard.viewAllChampions': 'View All Champions',
        'dashboard.noChampions': 'No active champions',
        'dashboard.noUpcomingEvents': 'No upcoming events',
        'dashboard.noRecentResults': 'No recent results',
        'dashboard.noActiveSeason': 'No active season',
        'dashboard.noChallenges': 'No pending challenges',
        'dashboard.mostWins': 'Most Wins',
        'dashboard.matchesPlayed': 'Matches Played',
        'dashboard.seasonStart': 'Season Start',
        'dashboard.daysReign': 'Day Reign',
        'dashboard.defenses': 'Defenses',
        'dashboard.countdown.days': 'd',
        'dashboard.countdown.hours': 'h',
        'dashboard.countdown.minutes': 'm',
        'dashboard.vs': 'vs',
        'dashboard.liveBadge': 'LIVE',
        'standings.table.player': 'Player',
        'common.retry': 'Retry',
      };
      if (map[key]) return map[key];
      if (typeof fallbackOrOpts === 'string') return fallbackOrOpts;
      if (fallbackOrOpts && typeof fallbackOrOpts === 'object' && 'defaultValue' in fallbackOrOpts) {
        return fallbackOrOpts.defaultValue as string;
      }
      return key;
    },
  }),
}));

vi.mock('../Dashboard.css', () => ({}));

vi.mock('../matchmaking/FindMatchWidget', () => ({
  default: () => null,
}));

vi.mock('../rivalries/DashboardRivalries', () => ({
  default: () => null,
}));

import Dashboard from '../Dashboard';

const emptyDashboard = {
  currentChampions: [],
  upcomingEvents: [],
  inProgressEvents: [],
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
    mockGetEvent.mockRejectedValue(new Error('not available'));
    mockGetAllEvents.mockResolvedValue([]);
    mockGetAllShows.mockResolvedValue([]);
    mockGetStandings.mockResolvedValue({ players: [], sortedByWins: true });
  });

  it('renders loading state initially then shows content after load', async () => {
    let resolve: (value: typeof emptyDashboard) => void;
    mockGetDashboard.mockImplementation(
      () => new Promise((r) => { resolve = r; })
    );

    renderDashboard();

    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);

    resolve!(emptyDashboard);
    await waitFor(() => {
      expect(screen.getByText('No active champions')).toBeInTheDocument();
    });
  });

  it('renders all dashboard sections after data loads', async () => {
    const dataWithContent = {
      ...emptyDashboard,
      currentChampions: [
        { championshipId: 'c1', championshipName: 'World', championName: 'Alice', playerId: 'p1', wonDate: '2025-01-01' },
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
    // Hero champion card
    expect(screen.getByText('World')).toBeInTheDocument();
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
    // Recent results
    expect(screen.getByText('Bob')).toBeInTheDocument();
    // Season
    expect(screen.getByText('Season 1')).toBeInTheDocument();
    // Quick stats
    expect(screen.getByText('Quick Stats')).toBeInTheDocument();
  });

  it('renders empty states when no data', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('No active champions')).toBeInTheDocument();
    });
    expect(await screen.findByText('No upcoming events')).toBeInTheDocument();
    expect(screen.getByText('No recent results')).toBeInTheDocument();
    expect(screen.getByText('No active season')).toBeInTheDocument();
  });

  describe('with no event open but a show on the schedule', () => {
    const inDays = (days: number) => {
      const date = new Date();
      date.setDate(date.getDate() + days);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    const plannedShow = (name: string, ppvDate: string) => ({
      showId: name, companyId: 'c1', name, schedule: 'ppv', ppvDate, createdAt: '', updatedAt: '',
    });

    it('leads with the next planned show instead of saying nothing is coming', async () => {
      mockGetAllShows.mockResolvedValue([plannedShow('Later Show', inDays(9)), plannedShow('Mayhem Monday', inDays(3))]);
      renderDashboard();

      expect(await screen.findByRole('heading', { level: 1, name: 'Mayhem Monday' })).toBeInTheDocument();
      expect(screen.queryByText('No upcoming events')).not.toBeInTheDocument();
    });

    it('skips a show whose date already has an event, even a cancelled one', async () => {
      mockGetAllShows.mockResolvedValue([plannedShow('Mayhem Monday', inDays(3))]);
      mockGetAllEvents.mockResolvedValue([{ eventId: 'e1', showId: 'Mayhem Monday', date: inDays(3), status: 'cancelled' }]);
      renderDashboard();

      expect(await screen.findByText('No upcoming events')).toBeInTheDocument();
    });

    it('falls back to the empty message when the schedule cannot load', async () => {
      mockGetAllShows.mockRejectedValue(new Error('down'));
      renderDashboard();

      expect(await screen.findByText('No upcoming events')).toBeInTheDocument();
    });
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
        expect(screen.getByText('No active champions')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('leads with the live event and lists the other shows under it', async () => {
    mockGetDashboard.mockResolvedValue({
      ...emptyDashboard,
      inProgressEvents: [{ eventId: 'live', name: 'Toxic Tuesday', date: '2026-11-03', eventType: 'weekly' }],
      upcomingEvents: [{ eventId: 'next', name: 'Summer Slam', date: '2027-08-01', eventType: 'ppv' }],
    });

    renderDashboard();

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Toxic Tuesday');
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Summer Slam/ })).toHaveAttribute('href', '/events/next');
    expect(screen.getByRole('link', { name: 'home.seeTheCard' })).toHaveAttribute('href', '/events/live');
  });

  it('leads with the next event when nothing is live, without a live badge', async () => {
    mockGetDashboard.mockResolvedValue({
      ...emptyDashboard,
      upcomingEvents: [
        { eventId: 'e1', name: 'First Show', date: '2099-01-01', eventType: 'ppv' },
        { eventId: 'e2', name: 'Second Show', date: '2099-02-01', eventType: 'ppv' },
      ],
    });

    renderDashboard();

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('First Show');
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
    expect(screen.getByText('home.nextUp')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Second Show/ })).toBeInTheDocument();
  });

  it('shows the booked main event in the hero', async () => {
    mockGetDashboard.mockResolvedValue({
      ...emptyDashboard,
      upcomingEvents: [{ eventId: 'e1', name: 'First Show', date: '2099-01-01', eventType: 'ppv' }],
    });
    mockGetEvent.mockResolvedValue({
      eventId: 'e1',
      description: 'Two rivals, one night.',
      enrichedMatches: [
        {
          position: 1,
          matchId: 'm1',
          designation: 'main-event',
          matchData: {
            isChampionship: true,
            championshipName: 'World Title',
            stipulationName: 'Steel Cage',
            participants: [
              { playerId: 'p1', playerName: 'Ann', wrestlerName: 'Edge' },
              { playerId: 'p2', playerName: 'Ben', wrestlerName: 'Sting' },
            ],
          },
        },
      ],
    });

    renderDashboard();

    expect(await screen.findByText('Edge vs Sting')).toBeInTheDocument();
    expect(screen.getByText('World Title · Steel Cage')).toBeInTheDocument();
    expect(screen.getByText('Two rivals, one night.')).toBeInTheDocument();
  });

  it('asks for the active season and shows the leaders, skipping players with no matches', async () => {
    mockGetDashboard.mockResolvedValue({
      ...emptyDashboard,
      seasonInfo: { seasonId: 's1', name: 'Season 1', status: 'active' },
    });
    mockGetStandings.mockResolvedValue({
      sortedByWins: true,
      players: [
        { playerId: 'p1', name: 'Ann', currentWrestler: 'Edge', wins: 3, losses: 1, draws: 0, recentForm: ['W', 'L'] },
        { playerId: 'p2', name: 'Ben', currentWrestler: 'Sting', wins: 0, losses: 0, draws: 0 },
      ],
    });

    renderDashboard();

    expect(await screen.findByRole('link', { name: /Edge/ })).toHaveAttribute('href', '/player/p1');
    expect(mockGetStandings).toHaveBeenCalledWith('s1', expect.any(AbortSignal));
    expect(screen.getByText('3-1-0')).toBeInTheDocument();
    expect(screen.queryByText('Sting')).not.toBeInTheDocument();
  });

  it('falls back to all time when no listed wrestler has a result this season', async () => {
    mockGetDashboard.mockResolvedValue({
      ...emptyDashboard,
      seasonInfo: { seasonId: 's1', name: 'Season 1', status: 'active' },
    });
    mockGetStandings.mockImplementation(async (seasonId?: string) => ({
      sortedByWins: true,
      players: seasonId
        ? [{ playerId: 'p1', name: 'Ann', currentWrestler: 'Edge', wins: 0, losses: 0, draws: 0 }]
        : [{ playerId: 'p1', name: 'Ann', currentWrestler: 'Edge', wins: 2, losses: 1, draws: 0 }],
    }));

    renderDashboard();

    expect(await screen.findByText('2-1-0')).toBeInTheDocument();
    expect(mockGetStandings).toHaveBeenCalledWith(undefined, expect.any(AbortSignal));
  });

  it('counts season matches apart from all-time matches', async () => {
    mockGetDashboard.mockResolvedValue({
      ...emptyDashboard,
      seasonInfo: { seasonId: 's1', name: 'Season 1', status: 'active', matchesPlayed: 9 },
      quickStats: { totalPlayers: 2, totalMatches: 48, activeChampionships: 3 },
    });

    renderDashboard();

    expect(await screen.findByText('9')).toBeInTheDocument();
    expect(screen.getByText('48')).toBeInTheDocument();
  });

  it('shows the poster whole in its own frame rather than behind the title', async () => {
    mockGetDashboard.mockResolvedValue({
      ...emptyDashboard,
      upcomingEvents: [{ eventId: 'e1', name: 'Toxic Tuesday', date: '2026-09-01', eventType: 'weekly' }],
    });
    mockGetEvent.mockResolvedValue({ eventId: 'e1', imageUrl: 'https://example.com/poster.png', enrichedMatches: [] });

    const { container } = renderDashboard();

    await screen.findByRole('heading', { name: 'Toxic Tuesday' });
    await waitFor(() => expect(container.querySelector('.poster-hero__frame img')).toHaveAttribute('src', 'https://example.com/poster.png'));
  });

  it('keeps the page up and offers a retry when the table fails to load', async () => {
    mockGetStandings.mockRejectedValueOnce(new Error('boom'));

    renderDashboard();

    await screen.findByText('home.standingsError');
    expect(screen.getByText('No active champions')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('home.noStandings')).toBeInTheDocument();
  });

  it('shows season progress only when the season has an end date', async () => {
    mockGetDashboard.mockResolvedValue({
      ...emptyDashboard,
      seasonInfo: { seasonId: 's1', name: 'Season 1', status: 'active', startDate: '2020-01-01', endDate: '2020-12-31' },
    });

    renderDashboard();

    expect(await screen.findByRole('progressbar')).toHaveAttribute('value', '100');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
