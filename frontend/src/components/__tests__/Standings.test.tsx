import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetStandings, mockGetAllSeasons, mockGetAllDivisions } = vi.hoisted(() => ({
  mockGetStandings: vi.fn(),
  mockGetAllSeasons: vi.fn(),
  mockGetAllDivisions: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  standingsApi: { get: mockGetStandings },
  seasonsApi: { getAll: mockGetAllSeasons },
  divisionsApi: { getAll: mockGetAllDivisions },
}));

vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'standings.title': 'Standings',
        'standings.pageTitle': 'Standings',
        'standings.loading': 'Loading standings...',
        'standings.noPlayers': 'No players found.',
        'standings.season': 'Season',
        'standings.allTime': 'All Time',
        'standings.showingFor': 'Showing for',
        'standings.filterByDivision': 'Filter by Division',
        'standings.noDivision': 'No Division',
        'standings.table.rank': 'Rank',
        'standings.table.image': 'Image',
        'standings.table.player': 'Player',
        'standings.table.wrestler': 'Wrestler',
        'standings.table.division': 'Division',
        'standings.table.wins': 'W',
        'standings.table.losses': 'L',
        'standings.table.draws': 'D',
        'standings.table.winPercent': 'Win %',
        'standings.table.form': 'Form',
        'standings.table.streak': 'Streak',
        'standings.lastResult': 'Last result',
        'standings.winStreak': 'Win Streak',
        'standings.lossStreak': 'Loss Streak',
        'standings.drawStreak': 'Draw Streak',
        'common.all': 'All',
        'common.error': 'Error',
        'common.retry': 'Retry',
        'common.active': 'Active',
      };
      return map[key] || key;
    },
  }),
}));

vi.mock('../Standings.css', () => ({}));
vi.mock('../PlayerHoverCard.css', () => ({}));

import Standings from '../Standings';

function renderStandings() {
  return render(
    <MemoryRouter>
      <Standings />
    </MemoryRouter>
  );
}

// --- Test data ---
const mockPlayers = [
  {
    playerId: 'p1',
    name: 'John Cena',
    currentWrestler: 'The Champ',
    wins: 25,
    losses: 10,
    draws: 3,
    divisionId: 'div1',
    createdAt: '2024-01-01',
    updatedAt: '2024-06-01',
  },
  {
    playerId: 'p2',
    name: 'The Rock',
    currentWrestler: 'The Great One',
    wins: 20,
    losses: 12,
    draws: 1,
    divisionId: 'div2',
    createdAt: '2024-01-01',
    updatedAt: '2024-06-01',
  },
  {
    playerId: 'p3',
    name: 'Undertaker',
    currentWrestler: 'The Deadman',
    wins: 18,
    losses: 5,
    draws: 0,
    createdAt: '2024-01-01',
    updatedAt: '2024-06-01',
  },
];

const mockSeasons = [
  {
    seasonId: 's1',
    name: 'Season 1',
    startDate: '2024-01-01',
    status: 'completed' as const,
    createdAt: '2024-01-01',
    updatedAt: '2024-06-01',
  },
  {
    seasonId: 's2',
    name: 'Season 2',
    startDate: '2024-06-01',
    status: 'active' as const,
    createdAt: '2024-06-01',
    updatedAt: '2024-06-01',
  },
];

const mockDivisions = [
  { divisionId: 'div1', name: 'Raw', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { divisionId: 'div2', name: 'SmackDown', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

describe('Standings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders standings table with W-L-D, win percentage, and player info', async () => {
    mockGetStandings.mockResolvedValue({
      players: mockPlayers,
      sortedByWins: true,
    });
    mockGetAllSeasons.mockResolvedValue(mockSeasons);
    mockGetAllDivisions.mockResolvedValue(mockDivisions);

    renderStandings();

    await waitFor(() => {
      expect(screen.getByText('Standings')).toBeInTheDocument();
    });

    // Table headers
    expect(screen.getByText('Rank')).toBeInTheDocument();
    expect(screen.getByText('Player')).toBeInTheDocument();
    expect(screen.getByText('Wrestler')).toBeInTheDocument();
    expect(screen.getByText('W')).toBeInTheDocument();
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
    expect(screen.getByText('Win %')).toBeInTheDocument();

    // Player data
    expect(screen.getByText('John Cena')).toBeInTheDocument();
    expect(screen.getByText('The Champ')).toBeInTheDocument();
    expect(screen.getByText('The Rock')).toBeInTheDocument();
    expect(screen.getByText('The Great One')).toBeInTheDocument();

    // Win percentages
    // 25/(25+10+3) = 65.8%
    expect(screen.getByText('65.8%')).toBeInTheDocument();
    // 20/(20+12+1) = 60.6%
    expect(screen.getByText('60.6%')).toBeInTheDocument();
    // 18/(18+5+0) = 78.3%
    expect(screen.getByText('78.3%')).toBeInTheDocument();

    // Division column shown when "all" selected (default)
    expect(screen.getByText('Division')).toBeInTheDocument();
    // "Raw" and "SmackDown" appear in both filter buttons AND table cells,
    // so verify they exist at least once
    expect(screen.getAllByText('Raw').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('SmackDown').length).toBeGreaterThanOrEqual(1);
    // Form and Streak columns
    expect(screen.getByText('Form')).toBeInTheDocument();
    expect(screen.getByText('Streak')).toBeInTheDocument();
  });

  it('renders player names as links to stats page', async () => {
    mockGetStandings.mockResolvedValue({
      players: mockPlayers,
      sortedByWins: true,
    });
    mockGetAllSeasons.mockResolvedValue(mockSeasons);
    mockGetAllDivisions.mockResolvedValue(mockDivisions);

    renderStandings();

    await waitFor(() => {
      expect(screen.getByText('John Cena')).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: 'John Cena' });
    expect(link).toHaveAttribute('href', '/stats/player/p1');
  });

  it('renders form dots and streak badge when data present', async () => {
    const playersWithForm = [
      {
        ...mockPlayers[0],
        recentForm: ['W', 'W', 'L', 'W', 'W'] as const,
        currentStreak: { type: 'W' as const, count: 5 },
      },
    ];
    mockGetStandings.mockResolvedValue({
      players: playersWithForm,
      sortedByWins: true,
    });
    mockGetAllSeasons.mockResolvedValue([]);
    mockGetAllDivisions.mockResolvedValue(mockDivisions);

    renderStandings();

    await waitFor(() => {
      expect(screen.getByText('John Cena')).toBeInTheDocument();
    });

    // Streak badge shows for 3+ wins
    expect(screen.getByTitle('Win Streak')).toBeInTheDocument();
    expect(screen.getByText(/5W/)).toBeInTheDocument();
  });

  it('renders dash when no recentForm', async () => {
    mockGetStandings.mockResolvedValue({
      players: mockPlayers,
      sortedByWins: true,
    });
    mockGetAllSeasons.mockResolvedValue([]);
    mockGetAllDivisions.mockResolvedValue(mockDivisions);

    renderStandings();

    await waitFor(() => {
      expect(screen.getByText('John Cena')).toBeInTheDocument();
    });

    // Form column shows dashes when no recentForm (multiple "-" in table)
    const formCells = screen.getAllByText('-');
    expect(formCells.length).toBeGreaterThanOrEqual(1);
  });

  it('filters standings by season when season selector is changed', async () => {
    mockGetStandings.mockResolvedValue({
      players: mockPlayers,
      sortedByWins: true,
    });
    mockGetAllSeasons.mockResolvedValue(mockSeasons);
    mockGetAllDivisions.mockResolvedValue(mockDivisions);

    const user = userEvent.setup();

    renderStandings();

    await waitFor(() => {
      expect(screen.getByText('Standings')).toBeInTheDocument();
    });

    // Season selector present with seasons
    const seasonSelect = screen.getByLabelText('Season:');
    expect(seasonSelect).toBeInTheDocument();

    // Should have All Time + 2 seasons
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent('All Time');
    expect(options[1]).toHaveTextContent('Season 1');
    expect(options[2]).toHaveTextContent('Season 2 (Active)');

    // Switch to Season 2
    mockGetStandings.mockResolvedValue({
      players: [mockPlayers[0]],
      seasonId: 's2',
      sortedByWins: true,
    });

    await user.selectOptions(seasonSelect, 's2');

    // Verify the API was called with the season ID
    await waitFor(() => {
      expect(mockGetStandings).toHaveBeenCalledWith('s2', expect.any(AbortSignal));
    });

    // Season badge appears
    await waitFor(() => {
      expect(screen.getByText(/Showing for/)).toBeInTheDocument();
    });
  });

  it('shows empty state when no players exist', async () => {
    mockGetStandings.mockResolvedValue({
      players: [],
      sortedByWins: true,
    });
    mockGetAllSeasons.mockResolvedValue([]);
    mockGetAllDivisions.mockResolvedValue([]);

    renderStandings();

    await waitFor(() => {
      expect(screen.getByText('No players found.')).toBeInTheDocument();
    });
  });

  it('shows error state with retry button when API fails', async () => {
    mockGetStandings.mockRejectedValue(new Error('Server down'));
    mockGetAllSeasons.mockResolvedValue([]);
    mockGetAllDivisions.mockResolvedValue([]);

    renderStandings();

    await waitFor(() => {
      expect(screen.getByText(/Error/)).toBeInTheDocument();
      expect(screen.getByText(/Server down/)).toBeInTheDocument();
    });

    // Retry button present
    const retryBtn = screen.getByText('Retry');
    expect(retryBtn).toBeInTheDocument();

    // Click retry triggers re-fetch
    mockGetStandings.mockResolvedValue({
      players: mockPlayers,
      sortedByWins: true,
    });

    await userEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockGetStandings).toHaveBeenCalledTimes(2);
    });
  });
});
