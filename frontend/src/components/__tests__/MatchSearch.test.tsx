import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const {
  mockGetAllMatches,
  mockGetAllPlayers,
  mockGetAllSeasons,
  mockGetAllChampionships,
  mockGetAllStipulations,
  mockGetAllMatchTypes,
} = vi.hoisted(() => ({
  mockGetAllMatches: vi.fn(),
  mockGetAllPlayers: vi.fn(),
  mockGetAllSeasons: vi.fn(),
  mockGetAllChampionships: vi.fn(),
  mockGetAllStipulations: vi.fn(),
  mockGetAllMatchTypes: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  matchesApi: { getAll: mockGetAllMatches },
  playersApi: { getAll: mockGetAllPlayers },
  seasonsApi: { getAll: mockGetAllSeasons },
  championshipsApi: { getAll: mockGetAllChampionships },
  stipulationsApi: { getAll: mockGetAllStipulations },
  matchTypesApi: { getAll: mockGetAllMatchTypes },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'matchSearch.title': 'Match Search',
        'matchSearch.filtersLabel': 'Match filters',
        'matchSearch.filters.player': 'Player',
        'matchSearch.filters.matchType': 'Match Type',
        'matchSearch.filters.stipulation': 'Stipulation',
        'matchSearch.filters.status': 'Status',
        'matchSearch.filters.championship': 'Championship',
        'matchSearch.filters.season': 'Season',
        'matchSearch.filters.dateFrom': 'From',
        'matchSearch.filters.dateTo': 'To',
        'matchSearch.filters.clearAll': 'Clear Filters',
        'matchSearch.resultsCount': `${opts?.count ?? 0} match(es) found`,
        'matchSearch.noResults': 'No Matches Found',
        'matchSearch.noResultsFiltered': 'No matches match your current filters.',
        'matchSearch.noMatches': 'No matches have been recorded yet.',
        'common.all': 'All',
        'common.scheduled': 'Scheduled',
        'common.completed': 'Completed',
        'common.error': 'Error',
        'common.retry': 'Retry',
        'common.vs': 'vs',
        'match.matchOfTheNight': 'Match of the Night',
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock('../MatchSearch.css', () => ({}));
vi.mock('../ui/Skeleton', () => ({
  default: () => <div data-testid="skeleton">Loading...</div>,
}));
vi.mock('../ui/EmptyState', () => ({
  default: ({ title, description, actionLabel, onAction }: {
    title: string; description: string; actionLabel?: string; onAction?: () => void;
  }) => (
    <div data-testid="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
      {actionLabel && onAction && <button onClick={onAction}>{actionLabel}</button>}
    </div>
  ),
}));

import MatchSearch from '../MatchSearch';

// --- Test data ---
const mockPlayers = [
  { playerId: 'p1', name: 'John Cena', currentWrestler: 'John Cena', wins: 10, losses: 5, draws: 0, createdAt: '', updatedAt: '' },
  { playerId: 'p2', name: 'The Rock', currentWrestler: 'The Rock', wins: 8, losses: 3, draws: 1, createdAt: '', updatedAt: '' },
];

const mockSeasons = [
  { seasonId: 's1', name: 'Season 1', startDate: '2024-01-01', status: 'completed' as const, createdAt: '', updatedAt: '' },
];

const mockChampionships = [
  { championshipId: 'c1', name: 'World Title', type: 'singles' as const, createdAt: '', isActive: true },
];

const mockStipulations = [
  { stipulationId: 'st1', name: 'Ladder Match', createdAt: '', updatedAt: '' },
];

const mockMatchTypes = [
  { matchTypeId: 'mt1', name: 'Singles', createdAt: '', updatedAt: '' },
  { matchTypeId: 'mt2', name: 'Tag Team', createdAt: '', updatedAt: '' },
];

const mockMatches = [
  {
    matchId: 'm1',
    date: '2024-03-15T20:00:00Z',
    matchFormat: 'Singles',
    participants: ['p1', 'p2'],
    winners: ['p1'],
    losers: ['p2'],
    isChampionship: false,
    status: 'completed' as const,
    createdAt: '2024-03-15',
  },
  {
    matchId: 'm2',
    date: '2024-04-01T20:00:00Z',
    matchFormat: 'Singles',
    participants: ['p1', 'p2'],
    isChampionship: true,
    championshipId: 'c1',
    status: 'scheduled' as const,
    createdAt: '2024-04-01',
  },
];

function renderWithRouter(initialEntries = ['/matches']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <MatchSearch />
    </MemoryRouter>,
  );
}

// --- Tests ---

describe('MatchSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllPlayers.mockResolvedValue(mockPlayers);
    mockGetAllSeasons.mockResolvedValue(mockSeasons);
    mockGetAllChampionships.mockResolvedValue(mockChampionships);
    mockGetAllStipulations.mockResolvedValue(mockStipulations);
    mockGetAllMatchTypes.mockResolvedValue(mockMatchTypes);
    mockGetAllMatches.mockResolvedValue(mockMatches);
  });

  it('renders loading state initially', () => {
    mockGetAllMatches.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithRouter();
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('renders match cards after loading', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('Match Search')).toBeInTheDocument();
    });
    // Both matches should be rendered (names appear in multiple cards)
    await waitFor(() => {
      expect(screen.getAllByText(/John Cena/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/The Rock/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders filter dropdowns with options', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByLabelText('Player')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Match Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Championship')).toBeInTheDocument();
    expect(screen.getByLabelText('Season')).toBeInTheDocument();
    expect(screen.getByLabelText('Stipulation')).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
  });

  it('populates player dropdown with fetched players', async () => {
    renderWithRouter();
    await waitFor(() => {
      const playerSelect = screen.getByLabelText('Player') as HTMLSelectElement;
      const options = Array.from(playerSelect.options).map((o) => o.text);
      expect(options).toContain('John Cena');
      expect(options).toContain('The Rock');
    });
  });

  it('calls matchesApi.getAll when a filter is changed', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByLabelText('Status')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'completed' } });

    await waitFor(() => {
      // Should be called at least twice: once on mount, once after filter change
      expect(mockGetAllMatches.mock.calls.length).toBeGreaterThanOrEqual(2);
      // Last call should include the status filter
      const lastCall = mockGetAllMatches.mock.calls[mockGetAllMatches.mock.calls.length - 1];
      expect(lastCall[0]).toEqual(expect.objectContaining({ status: 'completed' }));
    });
  });

  it('shows empty state when no matches exist', async () => {
    mockGetAllMatches.mockResolvedValue([]);
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('No Matches Found')).toBeInTheDocument();
    });
  });

  it('shows filtered empty state with clear button', async () => {
    mockGetAllMatches.mockResolvedValue([]);
    renderWithRouter(['/matches?status=completed']);

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('No matches match your current filters.')).toBeInTheDocument();
      // Clear Filters appears both in the filter panel and the empty state
      expect(screen.getAllByText('Clear Filters').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows error state when API fails', async () => {
    mockGetAllMatches.mockRejectedValue(new Error('API Error'));
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });

  it('displays match status badges', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Scheduled').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('highlights winners with match-winner class', async () => {
    renderWithRouter();

    await waitFor(() => {
      const winnerElements = screen.getAllByText('John Cena');
      const hasWinnerClass = winnerElements.some((el) => el.className.includes('match-winner'));
      expect(hasWinnerClass).toBe(true);
    });
  });
});
