import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';

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
  playersApi: { getDirectory: mockGetAllPlayers },
  seasonsApi: { getAll: mockGetAllSeasons },
  championshipsApi: { getAll: mockGetAllChampionships },
  stipulationsApi: { getAll: mockGetAllStipulations },
  matchTypesApi: { getAll: mockGetAllMatchTypes },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isAdmin: false,
    isAdminOrModerator: false,
    isModerator: false,
    isWrestler: false,
    user: null,
    role: null,
  }),
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
vi.mock('../ui/Select', () => ({
  default: ({ id, label, value, onValueChange, options }: {
    id?: string;
    label: string;
    value: string;
    onValueChange: (value: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <select id={id} aria-label={label} value={value} onChange={(e) => onValueChange(e.target.value)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ),
}));
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

type InitialEntries = ComponentProps<typeof MemoryRouter>['initialEntries'];

function renderWithRouter(initialEntries: InitialEntries = ['/matches']) {
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

  it('keeps the advanced filters behind the Filters button', async () => {
    renderWithRouter();
    await screen.findAllByText('John Cena');
    expect(screen.queryByLabelText('Player')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'matchSearch.filtersButton' }));

    expect(screen.getByLabelText('Player')).toBeInTheDocument();
    expect(screen.getByLabelText('Match Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Championship')).toBeInTheDocument();
    expect(screen.getByLabelText('Season')).toBeInTheDocument();
    expect(screen.getByLabelText('Stipulation')).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
  });

  it('opens the filter panel when the URL already has an advanced filter', async () => {
    renderWithRouter(['/matches?playerId=p1']);
    expect(await screen.findByLabelText('Player')).toHaveValue('p1');
  });

  it('populates player dropdown from the directory', async () => {
    renderWithRouter(['/matches?seasonId=s1']);
    await waitFor(() => {
      const playerSelect = screen.getByLabelText('Player') as HTMLSelectElement;
      const options = Array.from(playerSelect.options).map((o) => o.text);
      expect(options).toContain('John Cena');
      expect(options).toContain('The Rock');
    });
  });

  describe('with a hidden player in the directory', () => {
    const hiddenPlayer = { playerId: 'p9', name: 'Hidden Person', currentWrestler: null };

    const playerOptions = async (): Promise<string[]> => {
      const playerSelect = await screen.findByLabelText('Player') as HTMLSelectElement;
      await waitFor(() => expect(playerSelect.options.length).toBeGreaterThan(1));
      return Array.from(playerSelect.options).map((option) => option.text);
    };

    beforeEach(() => mockGetAllPlayers.mockResolvedValue([...mockPlayers, hiddenPlayer]));

    it('leaves them out of the filter', async () => {
      renderWithRouter(['/matches?seasonId=s1']);

      expect(await playerOptions()).not.toContain('Hidden Person');
    });

    it('keeps them listed when a link already filters by them', async () => {
      renderWithRouter(['/matches?playerId=p9']);

      expect(await playerOptions()).toContain('Hidden Person');
    });
  });

  it('calls matchesApi.getAll when the status tab changes', async () => {
    renderWithRouter();
    const completedTab = await screen.findByRole('tab', { name: 'Completed' });

    fireEvent.mouseDown(completedTab);

    await waitFor(() => {
      // Should be called at least twice: once on mount, once after filter change
      expect(mockGetAllMatches.mock.calls.length).toBeGreaterThanOrEqual(2);
      // Last call should include the status filter
      const lastCall = mockGetAllMatches.mock.calls[mockGetAllMatches.mock.calls.length - 1];
      expect(lastCall[0]).toEqual(expect.objectContaining({ status: 'completed' }));
    });
  });

  it('narrows the list with the quick search', async () => {
    mockGetAllMatches.mockResolvedValue([
      mockMatches[0],
      { ...mockMatches[1], matchFormat: 'Tag Team' },
    ]);
    renderWithRouter();
    await screen.findAllByText('John Cena');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'tag' } });

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('highlights the match passed through router state', async () => {
    renderWithRouter([{ pathname: '/matches', state: { matchId: 'm2' } }]);
    await screen.findAllByText('John Cena');
    const current = document.querySelector('[aria-current="true"]');
    expect(current).toHaveClass('match-row--focused');
    expect(document.querySelectorAll('.match-row--focused')).toHaveLength(1);
    expect(current).toHaveTextContent('Scheduled');
  });

  it('highlights the match named in the URL', async () => {
    renderWithRouter(['/matches?matchId=m1']);
    await screen.findAllByText('John Cena');
    expect(document.querySelector('[aria-current="true"]')).toHaveTextContent('Completed');
    expect(mockGetAllMatches.mock.calls[0][0]).toBeUndefined();
  });

  it('shows extra match data in the detail dialog', async () => {
    renderWithRouter();
    await screen.findAllByText('John Cena');
    fireEvent.click(screen.getAllByRole('button', { name: 'matchSearch.detailsFor' })[0]!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('matchSearch.detailDate')).toBeInTheDocument();
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

  it('shows a retry that reloads after an API failure', async () => {
    mockGetAllMatches.mockRejectedValueOnce(new Error('API Error'));
    renderWithRouter();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findAllByText('John Cena')).not.toHaveLength(0);
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
