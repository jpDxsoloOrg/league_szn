import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetH2HPlayers, mockGetH2H } = vi.hoisted(() => ({
  mockGetH2HPlayers: vi.fn(),
  mockGetH2H: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  statisticsApi: {
    getHeadToHeadPlayers: mockGetH2HPlayers,
    getHeadToHead: mockGetH2H,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'statistics.headToHead.title': 'Head to Head',
        'statistics.headToHead.player1': 'Player 1',
        'statistics.headToHead.player2': 'Player 2',
        'statistics.headToHead.statComparison': 'Stat Comparison',
        'statistics.headToHead.headToHeadRecord': 'Head-to-Head Record',
        'statistics.headToHead.recentResults': 'Recent Results',
        'statistics.headToHead.statisticalEdge': 'Statistical Edge',
        'statistics.headToHead.advantages': 'advantages',
        'statistics.headToHead.noHistory': 'No match history between these players.',
        'statistics.headToHead.selectDifferent': 'Select two different players',
        'statistics.headToHead.player1Win': 'P1 Win',
        'statistics.headToHead.player2Win': 'P2 Win',
        'statistics.labels.wins': 'Wins',
        'statistics.labels.losses': 'Losses',
        'statistics.labels.winPercentage': 'Win %',
        'statistics.labels.matchesPlayed': 'Matches Played',
        'statistics.labels.longestWinStreak': 'Longest Win Streak',
        'statistics.labels.titleWins': 'Title Wins',
        'statistics.labels.currentStreak': 'Current Streak',
        'statistics.labels.draws': 'Draws',
        'statistics.labels.totalMatches': 'total matches',
        'statistics.labels.championshipMatches': 'championship matches',
        'statistics.nav.playerStats': 'Player Stats',
        'statistics.nav.leaderboards': 'Leaderboards',
        'statistics.nav.taleOfTape': 'Tale of the Tape',
        'common.loading': 'Loading...',
        'common.vs': 'VS',
      };
      return map[key] || key;
    },
  }),
}));

vi.mock('../HeadToHeadComparison.css', () => ({}));

import HeadToHeadComparison from '../HeadToHeadComparison';

// --- Test data ---
const mockPlayers = [
  { playerId: 'p1', name: 'John Cena', wrestlerName: 'The Champ' },
  { playerId: 'p2', name: 'The Rock', wrestlerName: 'The Great One' },
  { playerId: 'p3', name: 'Undertaker', wrestlerName: 'The Deadman' },
];

const baseStat = {
  playerId: 'p1',
  statType: 'overall' as const,
  matchesPlayed: 30,
  winPercentage: 60.0,
  currentWinStreak: 3,
  longestWinStreak: 7,
  longestLossStreak: 2,
  firstMatchDate: '2024-01-01',
  lastMatchDate: '2024-06-01',
  championshipWins: 2,
  championshipLosses: 1,
  updatedAt: '2024-06-01',
};

const mockH2HResponse = {
  players: mockPlayers,
  player1Stats: { ...baseStat, playerId: 'p1', wins: 20, losses: 8, draws: 2 },
  player2Stats: { ...baseStat, playerId: 'p2', wins: 15, losses: 12, draws: 3, winPercentage: 50.0, longestWinStreak: 4, championshipWins: 1 },
  headToHead: {
    matchupKey: 'p1#p2',
    player1Id: 'p1',
    player2Id: 'p2',
    player1Wins: 5,
    player2Wins: 3,
    draws: 1,
    totalMatches: 9,
    championshipMatches: 2,
    recentResults: [
      { matchId: 'm1', winnerId: 'p1', date: '2024-06-01' },
      { matchId: 'm2', winnerId: 'p2', date: '2024-05-15' },
    ],
    updatedAt: '2024-06-01',
  },
};

function renderComponent() {
  return render(
    <BrowserRouter>
      <HeadToHeadComparison />
    </BrowserRouter>
  );
}

describe('HeadToHeadComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects two players and shows H2H record with comparison stats', async () => {
    mockGetH2HPlayers.mockResolvedValue({ players: mockPlayers });
    mockGetH2H.mockResolvedValue(mockH2HResponse);

    renderComponent();

    // Wait for H2H data to fully render (match metadata proves data is loaded)
    await waitFor(() => {
      expect(screen.getByText(/9 total matches/)).toBeInTheDocument();
    });

    // Both selectors present
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);

    // H2H record summary shows wins
    const recordWins = document.querySelectorAll('.h2h-record-wins');
    expect(recordWins).toHaveLength(2);
    expect(recordWins[0]).toHaveTextContent('5');
    expect(recordWins[1]).toHaveTextContent('3');

    // Match metadata
    expect(screen.getByText(/2 championship matches/)).toBeInTheDocument();

    // Stat comparison section
    expect(screen.getByText('Stat Comparison')).toBeInTheDocument();
  });

  it('displays recent results with winner names and badges', async () => {
    mockGetH2HPlayers.mockResolvedValue({ players: mockPlayers });
    mockGetH2H.mockResolvedValue(mockH2HResponse);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Recent Results')).toBeInTheDocument();
    });

    // Recent result dates within .h2h-recent-date elements
    const dates = document.querySelectorAll('.h2h-recent-date');
    expect(dates).toHaveLength(2);
    expect(dates[0]).toHaveTextContent('2024-06-01');
    expect(dates[1]).toHaveTextContent('2024-05-15');

    // Winner badges
    expect(screen.getByText('P1 Win')).toBeInTheDocument();
    expect(screen.getByText('P2 Win')).toBeInTheDocument();
  });

  it('shows message when same player is selected for both slots', async () => {
    const user = userEvent.setup();

    mockGetH2HPlayers.mockResolvedValue({ players: mockPlayers });
    // The initial auto-select will pick p1 and p2, triggering an H2H call
    mockGetH2H.mockResolvedValue(mockH2HResponse);

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Head-to-Head Record').length).toBeGreaterThanOrEqual(1);
    });

    const selects = screen.getAllByRole('combobox');
    // Change player 2 to same as player 1
    await user.selectOptions(selects[1]!, 'p1');

    await waitFor(() => {
      expect(screen.getByText('Select two different players')).toBeInTheDocument();
    });
  });
});
