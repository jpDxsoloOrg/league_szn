import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetLeaderboards } = vi.hoisted(() => ({
  mockGetLeaderboards: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  statisticsApi: { getLeaderboards: mockGetLeaderboards },
  seasonsApi: {
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
        'common.loading': 'Loading...',
        'common.days': 'days',
      };
      return map[key] || key;
    },
  }),
}));

vi.mock('../Leaderboards.css', () => ({}));
vi.mock('../SeasonSelector.css', () => ({}));

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

function renderComponent() {
  return render(
    <BrowserRouter>
      <Leaderboards />
    </BrowserRouter>
  );
}

describe('Leaderboards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders leaderboard entries for the default Most Wins category with medal badges', async () => {
    mockGetLeaderboards.mockResolvedValue({
      players: [],
      leaderboards: mockLeaderboards,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Leaderboards')).toBeInTheDocument();
    });

    // Default active tab is "Most Wins"
    expect(screen.getByText('John Cena')).toBeInTheDocument();
    expect(screen.getByText('The Rock')).toBeInTheDocument();
    expect(screen.getByText('Undertaker')).toBeInTheDocument();

    // Medal badges for top 3
    expect(screen.getByText('1st')).toBeInTheDocument();
    expect(screen.getByText('2nd')).toBeInTheDocument();
    expect(screen.getByText('3rd')).toBeInTheDocument();

    // 4th place gets a plain number
    expect(screen.getByText('4')).toBeInTheDocument();

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

    await waitFor(() => {
      expect(screen.getByText('Leaderboards')).toBeInTheDocument();
    });

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

  it('shows loading state while fetching data', async () => {
    mockGetLeaderboards.mockReturnValue(new Promise(() => {}));

    renderComponent();

    expect(screen.getByRole('status', { name: 'Loading...' })).toBeInTheDocument();
  });
});
