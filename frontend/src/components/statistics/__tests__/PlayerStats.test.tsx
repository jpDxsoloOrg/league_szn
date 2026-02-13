import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetPlayerStats } = vi.hoisted(() => ({
  mockGetPlayerStats: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  statisticsApi: { getPlayerStats: mockGetPlayerStats },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'statistics.playerStats.title': 'Player Stats',
        'statistics.playerStats.selectPlayer': 'Select Player',
        'statistics.playerStats.streaks': 'Streaks',
        'statistics.playerStats.matchTypeBreakdown': 'Match Type Breakdown',
        'statistics.playerStats.championshipHistory': 'Championship History',
        'statistics.playerStats.recentAchievements': 'Recent Achievements',
        'statistics.playerStats.viewAllAchievements': 'View All Achievements',
        'statistics.playerStats.noData': 'No data available',
        'statistics.labels.wins': 'Wins',
        'statistics.labels.losses': 'Losses',
        'statistics.labels.draws': 'Draws',
        'statistics.labels.winPercentage': 'Win %',
        'statistics.labels.matchesPlayed': 'matches played',
        'statistics.labels.currentStreak': 'Current Streak',
        'statistics.labels.longestWinStreak': 'Longest Win Streak',
        'statistics.labels.longestLossStreak': 'Longest Loss Streak',
        'statistics.labels.titleWins': 'Title Wins',
        'statistics.labels.active': 'Active',
        'statistics.labels.present': 'Present',
        'statistics.labels.matchType': 'Match Type',
        'statistics.labels.bestStreak': 'Best Streak',
        'statistics.labels.reigns': 'reigns',
        'statistics.labels.daysHeld': 'days held',
        'statistics.labels.defenses': 'defenses',
        'statistics.labels.longestReign': 'Longest Reign',
        'statistics.labels.currentChampion': 'Current Champion',
        'statistics.matchTypes.singles': 'Singles',
        'statistics.matchTypes.tag': 'Tag Team',
        'statistics.matchTypes.ladder': 'Ladder',
        'statistics.matchTypes.cage': 'Cage',
        'statistics.nav.headToHead': 'Head to Head',
        'statistics.nav.leaderboards': 'Leaderboards',
        'statistics.nav.taleOfTape': 'Tale of the Tape',
        'statistics.nav.records': 'Records',
        'statistics.nav.achievements': 'Achievements',
        'common.loading': 'Loading...',
        'common.days': 'days',
      };
      return map[key] || key;
    },
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({}) };
});

vi.mock('../PlayerStats.css', () => ({}));

import PlayerStats from '../PlayerStats';

// --- Test data ---
const mockPlayers = [
  { playerId: 'p1', name: 'John Cena', wrestlerName: 'The Champ' },
  { playerId: 'p2', name: 'The Rock', wrestlerName: 'The Great One' },
];

const overallStat = {
  playerId: 'p1',
  statType: 'overall' as const,
  wins: 25,
  losses: 10,
  draws: 3,
  matchesPlayed: 38,
  winPercentage: 65.8,
  currentWinStreak: 4,
  longestWinStreak: 8,
  longestLossStreak: 2,
  firstMatchDate: '2024-01-15',
  lastMatchDate: '2024-06-01',
  championshipWins: 3,
  championshipLosses: 1,
  updatedAt: '2024-06-01',
};

const singlesStat = {
  ...overallStat,
  statType: 'singles' as const,
  wins: 18,
  losses: 7,
  draws: 1,
  matchesPlayed: 26,
  winPercentage: 69.2,
  longestWinStreak: 6,
};

const tagStat = {
  ...overallStat,
  statType: 'tag' as const,
  wins: 7,
  losses: 3,
  draws: 2,
  matchesPlayed: 12,
  winPercentage: 58.3,
  longestWinStreak: 3,
};

const mockChampionshipStats = [
  {
    playerId: 'p1',
    championshipId: 'c1',
    championshipName: 'World Heavyweight Championship',
    totalReigns: 3,
    totalDaysHeld: 450,
    longestReign: 200,
    shortestReign: 50,
    totalDefenses: 12,
    mostDefensesInReign: 6,
    currentlyHolding: true,
    updatedAt: '2024-06-01',
  },
];

const mockAchievements = [
  {
    playerId: 'p1',
    achievementId: 'a1',
    achievementName: 'Grand Slam',
    achievementType: 'special' as const,
    description: 'Won every championship',
    earnedAt: '2024-05-01',
    icon: 'trophy',
  },
];

const fullPlayerStatsResponse = {
  players: mockPlayers,
  statistics: [overallStat, singlesStat, tagStat],
  championshipStats: mockChampionshipStats,
  achievements: mockAchievements,
};

function renderComponent() {
  return render(
    <BrowserRouter>
      <PlayerStats />
    </BrowserRouter>
  );
}

describe('PlayerStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders player selector and populates dropdown with players', async () => {
    // First call returns player list, second returns full stats for first player
    mockGetPlayerStats
      .mockResolvedValueOnce({ players: mockPlayers })
      .mockResolvedValueOnce(fullPlayerStatsResponse);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Select Player')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('John Cena (The Champ)');
    expect(options[1]).toHaveTextContent('The Rock (The Great One)');
  });

  it('shows W-L-D record card, streaks, match type breakdown, championship history, and achievements', async () => {
    mockGetPlayerStats
      .mockResolvedValueOnce({ players: mockPlayers })
      .mockResolvedValueOnce(fullPlayerStatsResponse);

    renderComponent();

    // W-L-D card -- use CSS class selectors to avoid collisions with other numbers
    await waitFor(() => {
      expect(screen.getByText('38 matches played')).toBeInTheDocument();
    });

    // Wins/Losses/Draws in the W-L-D display
    const wldNumbers = document.querySelectorAll('.ps-wld-number');
    expect(wldNumbers[0]).toHaveTextContent('25');
    expect(wldNumbers[1]).toHaveTextContent('10');
    expect(wldNumbers[2]).toHaveTextContent('3');

    expect(screen.getByText('65.8%')).toBeInTheDocument();

    // Streak card
    expect(screen.getByText('Streaks')).toBeInTheDocument();

    // Match type breakdown table
    expect(screen.getByText('Match Type Breakdown')).toBeInTheDocument();
    // "Singles"/"Tag Team" appear in both bar chart labels and table rows
    expect(screen.getAllByText('Singles').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Tag Team').length).toBeGreaterThanOrEqual(1);

    // Championship history
    expect(screen.getByText('Championship History')).toBeInTheDocument();
    expect(screen.getByText(/World Heavyweight Championship/)).toBeInTheDocument();
    expect(screen.getByText('Current Champion')).toBeInTheDocument();
    expect(screen.getByText(/3 reigns/)).toBeInTheDocument();
    expect(screen.getByText(/450 days held/)).toBeInTheDocument();

    // Achievements
    expect(screen.getByText('Recent Achievements')).toBeInTheDocument();
    expect(screen.getByText('Grand Slam')).toBeInTheDocument();
    expect(screen.getByText('View All Achievements')).toBeInTheDocument();
  });

  it('shows loading state initially', async () => {
    mockGetPlayerStats.mockReturnValue(new Promise(() => {})); // never resolves

    renderComponent();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows error message when player stats API fails', async () => {
    // First call succeeds (loads players), second call fails (stats fetch)
    mockGetPlayerStats
      .mockResolvedValueOnce({ players: mockPlayers })
      .mockRejectedValueOnce(new Error('Network error'));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Failed to load player statistics')).toBeInTheDocument();
    });
  });

  it('changes player when a different one is selected from the dropdown', async () => {
    const user = userEvent.setup();

    mockGetPlayerStats
      .mockResolvedValueOnce({ players: mockPlayers })
      .mockResolvedValueOnce(fullPlayerStatsResponse);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    // Wait for initial stats to render
    await waitFor(() => {
      // The h3 inside the record card shows the name
      const nameHeading = document.querySelector('.ps-record-card h3');
      expect(nameHeading).toHaveTextContent('John Cena (The Champ)');
    });

    // Setup mock for the second player selection
    mockGetPlayerStats.mockResolvedValueOnce({
      ...fullPlayerStatsResponse,
      statistics: [
        { ...overallStat, playerId: 'p2', wins: 30 },
        { ...singlesStat, playerId: 'p2' },
      ],
    });

    await user.selectOptions(screen.getByRole('combobox'), 'p2');

    // The third call should be for player p2
    await waitFor(() => {
      expect(mockGetPlayerStats).toHaveBeenCalledWith('p2', expect.any(AbortSignal));
    });
  });
});
