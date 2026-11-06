import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetAllChampionships, mockGetAllPlayers, mockGetDirectory, mockGetHistory, mockGetAllDivisions } = vi.hoisted(() => ({
  mockGetAllChampionships: vi.fn(),
  mockGetAllPlayers: vi.fn(),
  mockGetDirectory: vi.fn(),
  mockGetHistory: vi.fn(),
  mockGetAllDivisions: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  championshipsApi: {
    getAll: mockGetAllChampionships,
    getHistory: mockGetHistory,
  },
  playersApi: {
    getAll: mockGetAllPlayers,
    getDirectory: mockGetDirectory,
  },
  divisionsApi: {
    getAll: mockGetAllDivisions,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'championships.title': 'Championships',
        'championships.loading': 'Loading championships...',
        'championships.noChampionships': 'No championships available.',
        'championships.currentChampion': 'Current Champion',
        'championships.viewHistory': 'View History',
        'championships.singles': 'Singles',
        'championships.tagTeam': 'Tag Team',
        'championships.history': 'History',
        'championships.loadingHistory': 'Loading history...',
        'championships.noHistory': 'No history available.',
        'championships.table.champion': 'Champion',
        'championships.table.wonDate': 'Won Date',
        'championships.table.lostDate': 'Lost Date',
        'championships.table.daysHeld': 'Days Held',
        'championships.table.defenses': 'Defenses',
        'common.unknown': 'Unknown',
        'common.vacant': 'Vacant',
        'common.current': 'Current',
        'common.days': 'days',
        'common.error': 'Error',
        'common.retry': 'Retry',
        'common.noImage': 'No Image',
        'common.closeModal': 'Close modal',
      };
      return translations[key] || key;
    },
  }),
}));

// Suppress CSS import
vi.mock('../Championships.css', () => ({}));

import Championships from '../Championships';

// --- Test data ---
const mockPlayers = [
  { playerId: 'p1', name: 'John Cena', currentWrestler: 'John Cena', wins: 10, losses: 2, draws: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p2', name: 'The Rock', currentWrestler: 'The Rock', wins: 8, losses: 3, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p3', name: 'Undertaker', currentWrestler: 'Undertaker', wins: 15, losses: 5, draws: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const mockChampionships = [
  {
    championshipId: 'c1',
    name: 'World Heavyweight Championship',
    type: 'singles' as const,
    currentChampion: 'p1',
    isActive: true,
    imageUrl: 'https://example.com/belt.jpg',
    createdAt: '2024-01-01',
  },
  {
    championshipId: 'c2',
    name: 'Tag Team Championship',
    type: 'tag' as const,
    currentChampion: undefined,
    isActive: true,
    createdAt: '2024-01-01',
  },
];

// Includes a former champion who is missing from the public roster.
const mockDirectory = [
  ...mockPlayers.map(({ playerId, name, currentWrestler }) => ({ playerId, name, currentWrestler })),
  { playerId: 'p9', name: 'Retired Legend', currentWrestler: null },
];

function renderChampionships() {
  return render(
    <BrowserRouter>
      <Championships />
    </BrowserRouter>
  );
}

describe('Championships', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDirectory.mockResolvedValue(mockDirectory);
  });

  it('shows loading state while data is being fetched', () => {
    // Never resolve the promises to keep loading state
    mockGetAllChampionships.mockReturnValue(new Promise(() => {}));
    mockGetAllPlayers.mockReturnValue(new Promise(() => {}));
    mockGetDirectory.mockReturnValue(new Promise(() => {}));
    mockGetAllDivisions.mockReturnValue(new Promise(() => {}));

    renderChampionships();

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders championship list with current holders', async () => {
    mockGetAllChampionships.mockResolvedValue(mockChampionships);
    mockGetAllPlayers.mockResolvedValue(mockPlayers);
    mockGetAllDivisions.mockResolvedValue([]);

    renderChampionships();

    await waitFor(() => {
      expect(screen.getByText('Championships')).toBeInTheDocument();
    });

    // Championship names rendered
    expect(screen.getByText('World Heavyweight Championship')).toBeInTheDocument();
    expect(screen.getByText('Tag Team Championship')).toBeInTheDocument();

    // Only the type that needs saying is rendered
    expect(screen.queryByText('Singles')).not.toBeInTheDocument();
    expect(screen.getByText('Tag Team')).toBeInTheDocument();

    // Current champion resolved to player name
    expect(screen.getByText('John Cena')).toBeInTheDocument();

    // Vacant championship shows "Vacant"
    expect(screen.getByText('Vacant')).toBeInTheDocument();

    // Image rendered for first championship
    const img = screen.getByAltText('World Heavyweight Championship');
    expect(img).toHaveAttribute('src', 'https://example.com/belt.jpg');
  });

  it('handles empty state when no championships exist', async () => {
    mockGetAllChampionships.mockResolvedValue([]);
    mockGetAllPlayers.mockResolvedValue(mockPlayers);
    mockGetAllDivisions.mockResolvedValue([]);

    renderChampionships();

    await waitFor(() => {
      expect(screen.getByText('No championships available.')).toBeInTheDocument();
    });

    expect(screen.getByText('Championships')).toBeInTheDocument();
  });

  it('names former champions from the directory in the history dialog', async () => {
    const user = userEvent.setup();
    mockGetAllChampionships.mockResolvedValue(mockChampionships);
    mockGetAllPlayers.mockResolvedValue(mockPlayers);
    mockGetAllDivisions.mockResolvedValue([]);
    mockGetHistory.mockResolvedValue([
      { championshipId: 'c1', champion: 'p1', wonDate: '2024-03-01', matchId: 'm2', defenses: 2 },
      { championshipId: 'c1', champion: 'p9', wonDate: '2024-01-01', lostDate: '2024-03-01', matchId: 'm1', daysHeld: 60 },
    ]);

    renderChampionships();

    await user.click(await screen.findByRole('button', { name: 'View History: World Heavyweight Championship' }));

    const dialog = await screen.findByRole('dialog', { name: 'World Heavyweight Championship History' });
    expect(await within(dialog).findByText('Retired Legend')).toBeInTheDocument();
    expect(within(dialog).getByText('60 days')).toBeInTheDocument();
    expect(mockGetHistory).toHaveBeenCalledWith('c1', expect.any(AbortSignal));
  });

  it('reports a failed history load inside the dialog', async () => {
    const user = userEvent.setup();
    mockGetAllChampionships.mockResolvedValue(mockChampionships);
    mockGetAllPlayers.mockResolvedValue(mockPlayers);
    mockGetAllDivisions.mockResolvedValue([]);
    mockGetHistory.mockRejectedValue(new Error('Nope'));

    renderChampionships();

    await user.click(await screen.findByRole('button', { name: 'View History: World Heavyweight Championship' }));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('championships.historyLoadFailed')).toBeInTheDocument();
  });

  it('shows an empty state when a division has no titles', async () => {
    const user = userEvent.setup();
    mockGetAllChampionships.mockResolvedValue(mockChampionships);
    mockGetAllPlayers.mockResolvedValue(mockPlayers);
    mockGetAllDivisions.mockResolvedValue([
      { divisionId: 'd1', name: 'Raw', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    ]);

    renderChampionships();

    await user.click(await screen.findByRole('button', { name: 'Raw' }));

    expect(screen.getByText('championships.noneInDivision')).toBeInTheDocument();
  });
});
