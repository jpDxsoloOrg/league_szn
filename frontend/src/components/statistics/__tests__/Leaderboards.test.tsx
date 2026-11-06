import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetLeaderboards } = vi.hoisted(() => ({
  mockGetLeaderboards: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  statisticsApi: { getLeaderboards: mockGetLeaderboards },
  seasonsApi: {
    getAll: vi.fn().mockResolvedValue([]),
  },
  matchTypesApi: {
    getAll: vi.fn().mockResolvedValue([{ matchTypeId: 'mt-tag', name: 'Tag Team', createdAt: '', updatedAt: '' }]),
  },
  stipulationsApi: {
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'statistics.leaderboards.title': 'Leaderboards',
        'statistics.leaderboards.allTime': 'All Time',
        'statistics.leaderboards.season': 'Season',
        'statistics.leaderboards.categories.mostWins': 'Most Wins',
        'statistics.leaderboards.categories.winPercentage': 'Win %',
        'statistics.leaderboards.categories.streaks': 'Streaks',
        'statistics.leaderboards.categories.championships': 'Championships',
        'statistics.leaderboards.categories.longestReign': 'Longest Reign',
        'statistics.leaderboards.noData': 'No data available yet.',
        'statistics.nav.playerStats': 'Player Stats',
        'statistics.nav.headToHead': 'Head to Head',
        'statistics.nav.records': 'Records',
        'statistics.labels.matchType': 'Match Type',
        'statistics.loadFailed': 'Could not load these stats',
        'common.all': 'All',
        'common.retry': 'Retry',
        'common.loading': 'Loading...',
        'common.days': 'days',
      };
      return map[key] || key;
    },
  }),
}));

vi.mock('../Leaderboards.css', () => ({}));

import Leaderboards from '../Leaderboards';

// --- Test data ---
const mockLeaderboards = {
  mostWins: [
    { playerId: 'p1', playerName: 'John Cena', wrestlerName: 'The Champ', value: 25, rank: 1 },
    { playerId: 'p2', playerName: 'The Rock', wrestlerName: 'The Great One', value: 20, rank: 2 },
    { playerId: 'p3', playerName: 'Undertaker', wrestlerName: 'The Deadman', value: 18, rank: 3 },
    { playerId: 'p4', playerName: 'Triple H', wrestlerName: 'The Game', value: 12, rank: 4 },
  ],
  bestWinPercentage: [
    { playerId: 'p1', playerName: 'John Cena', wrestlerName: 'The Champ', value: 72.5, rank: 1 },
    { playerId: 'p3', playerName: 'Undertaker', wrestlerName: 'The Deadman', value: 68.2, rank: 2 },
  ],
  longestStreak: [],
  mostChampionships: [],
  longestReign: [],
};

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}

function renderComponent() {
  return render(
    <MemoryRouter initialEntries={['/stats/leaderboards']}>
      <Leaderboards />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('Leaderboards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the default Most Wins category with a top-three podium and a list below', async () => {
    mockGetLeaderboards.mockResolvedValue({
      players: [],
      leaderboards: mockLeaderboards,
    });

    renderComponent();

    // Default active tab is "Most Wins"
    expect(await screen.findByText('John Cena')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Leaderboards' })).toBeInTheDocument();
    expect(screen.getByText('The Rock')).toBeInTheDocument();
    expect(screen.getByText('Undertaker')).toBeInTheDocument();

    // Podium ranks for the top 3
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();

    // 4th place sits in the list and links to the player's stats
    expect(screen.getByText('#4')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Triple H' })).toHaveAttribute('href', '/stats/player/p4');

    // Values shown
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('switches category tabs and displays corresponding entries', async () => {
    const user = userEvent.setup();
    mockGetLeaderboards.mockResolvedValue({
      players: [],
      leaderboards: mockLeaderboards,
    });

    renderComponent();

    await screen.findByText('John Cena');

    // Switch to Win % tab
    await user.click(screen.getByText('Win %'));

    // Win percentage entries display with % suffix and decimal
    await waitFor(() => {
      expect(screen.getByText('72.5%')).toBeInTheDocument();
      expect(screen.getByText('68.2%')).toBeInTheDocument();
    });

    // Switch to Streaks (empty category)
    await user.click(screen.getByText('Streaks'));

    await waitFor(() => {
      expect(screen.getByText('No data available yet.')).toBeInTheDocument();
    });
  });

  it('moves to the filtered board when a match type is chosen', async () => {
    const user = userEvent.setup();
    mockGetLeaderboards.mockResolvedValue({ players: [], leaderboards: mockLeaderboards });

    renderComponent();

    await user.click(await screen.findByRole('combobox', { name: 'Match Type' }));
    await user.click(await screen.findByRole('option', { name: 'Tag Team' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/stats/match-types?matchType=mt-tag');
  });

  it('offers a retry instead of an empty board when loading fails', async () => {
    mockGetLeaderboards.mockRejectedValue(new Error('Network error'));

    renderComponent();

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('No data available yet.')).not.toBeInTheDocument();
  });

  it('shows loading state while fetching data', async () => {
    mockGetLeaderboards.mockReturnValue(new Promise(() => {}));

    renderComponent();

    expect(screen.getByRole('status', { name: 'Loading...' })).toBeInTheDocument();
  });
});
