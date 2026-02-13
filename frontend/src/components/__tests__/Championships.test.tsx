import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetAllChampionships, mockGetAllPlayers, mockGetHistory, mockGetAllDivisions } = vi.hoisted(() => ({
  mockGetAllChampionships: vi.fn(),
  mockGetAllPlayers: vi.fn(),
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
  });

  it('shows loading state while data is being fetched', () => {
    // Never resolve the promises to keep loading state
    mockGetAllChampionships.mockReturnValue(new Promise(() => {}));
    mockGetAllPlayers.mockReturnValue(new Promise(() => {}));
    mockGetAllDivisions.mockReturnValue(new Promise(() => {}));

    renderChampionships();

    expect(screen.getByText('Loading championships...')).toBeInTheDocument();
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

    // Types rendered
    expect(screen.getByText('Singles')).toBeInTheDocument();
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
});
