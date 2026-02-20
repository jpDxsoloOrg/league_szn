import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Hoisted mocks ---
const { mockFantasyApi, mockSeasonsApi } = vi.hoisted(() => ({
  mockFantasyApi: {
    getLeaderboard: vi.fn(),
    getAllMyPicks: vi.fn(),
  },
  mockSeasonsApi: {
    getAll: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  fantasyApi: mockFantasyApi,
  seasonsApi: mockSeasonsApi,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`;
      return key;
    },
  }),
}));

import FantasyLeaderboard from '../FantasyLeaderboard';
import type { FantasyLeaderboardEntry } from '../../../types/fantasy';
import type { Season } from '../../../types';

// --- Test data ---
const mockSeasons: Season[] = [
  {
    seasonId: 's1', name: 'Season 1', startDate: '2024-01-01',
    status: 'active', createdAt: '2024-01-01', updatedAt: '2024-01-01',
  },
  {
    seasonId: 's2', name: 'Season 0', startDate: '2023-06-01',
    endDate: '2023-12-31', status: 'completed',
    createdAt: '2023-06-01', updatedAt: '2023-12-31',
  },
];

const mockLeaderboard: FantasyLeaderboardEntry[] = [
  {
    rank: 1, fantasyUserId: 'u1', username: 'ChampPlayer',
    totalPoints: 500, currentSeasonPoints: 250, perfectPicks: 3, currentStreak: 5,
  },
  {
    rank: 2, fantasyUserId: 'u2', username: 'RunnerUp',
    totalPoints: 400, currentSeasonPoints: 200, perfectPicks: 1, currentStreak: 2,
  },
  {
    rank: 3, fantasyUserId: 'u3', username: 'BronzePlayer',
    totalPoints: 300, currentSeasonPoints: 150, perfectPicks: 0, currentStreak: 0,
  },
];

describe('FantasyLeaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSeasonsApi.getAll.mockResolvedValue(mockSeasons);
    mockFantasyApi.getAllMyPicks.mockResolvedValue([]);
    mockFantasyApi.getLeaderboard.mockResolvedValue(mockLeaderboard);
  });

  it('renders leaderboard table with ranks, points, perfect picks, and streak', async () => {
    // To avoid racing between the seasons effect (which changes selectedSeasonId)
    // and the leaderboard effect, return no seasons so the ID stays empty and
    // only one leaderboard fetch fires.
    mockSeasonsApi.getAll.mockResolvedValue([]);

    render(<FantasyLeaderboard />);

    await waitFor(() => {
      expect(screen.getByText('ChampPlayer')).toBeInTheDocument();
    });

    // Table headers
    expect(screen.getByText('fantasy.leaderboard.rank')).toBeInTheDocument();
    expect(screen.getByText('fantasy.leaderboard.player')).toBeInTheDocument();
    expect(screen.getByText('fantasy.leaderboard.points')).toBeInTheDocument();
    expect(screen.getByText('fantasy.leaderboard.perfect')).toBeInTheDocument();
    expect(screen.getByText('fantasy.leaderboard.streak')).toBeInTheDocument();

    // Player data rendered
    expect(screen.getByText('RunnerUp')).toBeInTheDocument();
    expect(screen.getByText('BronzePlayer')).toBeInTheDocument();

    // Points values displayed
    expect(screen.getByText('250')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();

    // Perfect picks: ChampPlayer has 3, shown in .perfect-count span
    const perfectCounts = screen.getAllByText('3');
    expect(perfectCounts.length).toBeGreaterThanOrEqual(1);
  });

  it('shows season filter with active season pre-selected', async () => {
    render(<FantasyLeaderboard />);

    await waitFor(() => {
      expect(screen.getByText('ChampPlayer')).toBeInTheDocument();
    });

    // Season selector present
    const seasonSelect = screen.getByLabelText('fantasy.leaderboard.season:');
    expect(seasonSelect).toBeInTheDocument();

    // Active season should be pre-selected
    expect(seasonSelect).toHaveValue('s1');

    // Leaderboard is eventually fetched with active season ID after initial load
    await waitFor(() => {
      expect(mockFantasyApi.getLeaderboard).toHaveBeenCalledWith('s1', expect.any(Object));
    });
  });

  it('filters by season when selecting a different option', async () => {
    const user = userEvent.setup();
    render(<FantasyLeaderboard />);

    await waitFor(() => {
      expect(screen.getByText('ChampPlayer')).toBeInTheDocument();
    });

    // Change to "All Seasons"
    const seasonSelect = screen.getByLabelText('fantasy.leaderboard.season:');
    await user.selectOptions(seasonSelect, '');

    await waitFor(() => {
      expect(mockFantasyApi.getLeaderboard).toHaveBeenCalledWith(
        undefined,
        expect.any(Object)
      );
    });
  });

  it('shows empty state when no leaderboard entries', async () => {
    // Return no seasons so selectedSeasonId stays empty and only one leaderboard
    // fetch fires
    mockSeasonsApi.getAll.mockResolvedValue([]);
    mockFantasyApi.getLeaderboard.mockResolvedValue([]);

    render(<FantasyLeaderboard />);

    // The t() mock renders default values as part of the key when a string default
    // is passed, so match with a regex for the key prefix
    await waitFor(() => {
      expect(screen.getByText(/fantasy\.leaderboard\.noEntries/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
