import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

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
  seasonsApi: {
    getAll: vi.fn().mockResolvedValue([]),
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
        'statistics.taleOfTape.title': 'Tale of the Tape',
        'statistics.headToHead.compareView': 'Compare',
        'statistics.headToHead.needTwoPlayers': 'At least two players are needed.',
        'statistics.labels.titleLosses': 'Title Losses',
        'statistics.labels.longestLossStreak': 'Worst Loss Streak',
        'statistics.loadFailed': 'Could not load these stats',
        'common.retry': 'Retry',
        'common.loading': 'Loading...',
        'common.vs': 'VS',
      };
      return map[key] || key;
    },
  }),
}));

vi.mock('../HeadToHeadComparison.css', () => ({}));

import HeadToHeadComparison from '../HeadToHeadComparison';
import TaleOfTheTape from '../TaleOfTheTape';

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

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}

function renderComponent(entry = '/stats/head-to-head') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/stats/head-to-head" element={<HeadToHeadComparison />} />
        <Route path="/stats/tale-of-tape" element={<TaleOfTheTape />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
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
    expect(screen.getByRole('heading', { level: 1, name: 'Head to Head' })).toBeInTheDocument();
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
    expect(dates[0]).toHaveTextContent('Jun 1, 2024');
    expect(dates[1]).toHaveTextContent('May 15, 2024');

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

    // Change player 2 to same as player 1
    await user.click(screen.getByRole('combobox', { name: 'Player 2' }));
    await user.click(await screen.findByRole('option', { name: 'John Cena (The Champ)' }));

    await waitFor(() => {
      expect(screen.getByText('Select two different players')).toBeInTheDocument();
    });
  });

  it.each([
    ['player1 and player2', '/stats/head-to-head?player1=p3&player2=p2'],
    ['player1Id and player2Id', '/stats/head-to-head?player1Id=p3&player2Id=p2'],
  ])('preselects the matchup from %s in the URL', async (_names, entry) => {
    mockGetH2HPlayers.mockResolvedValue({ players: mockPlayers });
    mockGetH2H.mockResolvedValue(mockH2HResponse);

    renderComponent(entry);

    await waitFor(() => {
      expect(mockGetH2H).toHaveBeenCalledWith('p3', 'p2', undefined, expect.any(AbortSignal));
    });
    expect(screen.getByRole('combobox', { name: 'Player 1' })).toHaveTextContent('Undertaker (The Deadman)');
  });

  it('fills the empty slot when only one player is linked', async () => {
    mockGetH2HPlayers.mockResolvedValue({ players: mockPlayers });
    mockGetH2H.mockResolvedValue(mockH2HResponse);

    renderComponent('/stats/head-to-head?player2=p1');

    await waitFor(() => {
      expect(mockGetH2H).toHaveBeenCalledWith('p2', 'p1', undefined, expect.any(AbortSignal));
    });
  });

  it('keeps the matchup when switching to the Tale of the Tape view', async () => {
    const user = userEvent.setup();
    mockGetH2HPlayers.mockResolvedValue({ players: mockPlayers });
    mockGetH2H.mockResolvedValue(mockH2HResponse);

    renderComponent('/stats/head-to-head?player1=p3&player2=p2');

    await user.click(await screen.findByRole('link', { name: 'Tale of the Tape' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/stats/tale-of-tape?player1=p3&player2=p2');
    expect(await screen.findByText('Title Losses')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Tale of the Tape' })).toBeInTheDocument();
    expect(mockGetH2H).toHaveBeenLastCalledWith('p3', 'p2', undefined, expect.any(AbortSignal));
  });

  it('counts fewer losses as the advantage on the tape', async () => {
    mockGetH2HPlayers.mockResolvedValue({ players: mockPlayers });
    mockGetH2H.mockResolvedValue(mockH2HResponse);

    renderComponent('/stats/tale-of-tape');

    const lossRow = (await screen.findByText('Losses')).closest('li');
    expect(lossRow?.querySelector('.h2h-better')).toHaveTextContent('8');
  });

  it('shows a drawn match as a draw, not as a win for either player', async () => {
    mockGetH2HPlayers.mockResolvedValue({ players: mockPlayers });
    mockGetH2H.mockResolvedValue({
      ...mockH2HResponse,
      headToHead: {
        ...mockH2HResponse.headToHead,
        recentResults: [{ matchId: 'm3', winnerId: '', date: '2024-04-01' }],
      },
    });

    renderComponent();

    expect((await screen.findByText('Apr 1, 2024')).closest('li')).toHaveTextContent('Draws');
    expect(screen.queryByText('P2 Win')).not.toBeInTheDocument();
  });

  it('shows an empty state when fewer than two players exist', async () => {
    mockGetH2HPlayers.mockResolvedValue({ players: [mockPlayers[0]] });

    renderComponent();

    expect(await screen.findByText('At least two players are needed.')).toBeInTheDocument();
    expect(mockGetH2H).not.toHaveBeenCalled();
  });

  it('offers a retry when the comparison fails to load', async () => {
    const user = userEvent.setup();
    mockGetH2HPlayers.mockResolvedValue({ players: mockPlayers });
    mockGetH2H.mockRejectedValueOnce(new Error('Network error')).mockResolvedValue(mockH2HResponse);

    renderComponent();

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Stat Comparison')).toBeInTheDocument();
  });
});
