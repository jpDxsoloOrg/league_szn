import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetAllMatches, mockGetAllPlayers } = vi.hoisted(() => ({
  mockGetAllMatches: vi.fn(),
  mockGetAllPlayers: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  matchesApi: { getAll: mockGetAllMatches },
  playersApi: { getAll: mockGetAllPlayers },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'matches.title': 'Matches',
        'matches.loading': 'Loading matches...',
        'matches.noMatches': 'No matches found.',
        'matches.filters.all': 'All',
        'matches.filters.scheduled': 'Scheduled',
        'matches.filters.completed': 'Completed',
        'matches.participants': 'Participants',
        'matches.championship': 'Championship',
        'matches.winner': 'Winner',
        'matches.winners': 'Winners',
        'matches.loser': 'Loser',
        'matches.losers': 'Losers',
        'matches.winningTeam': 'Winning Team',
        'matches.losingTeam': 'Losing Team',
        'matches.losingTeams': 'Losing Teams',
        'common.unknown': 'Unknown',
        'common.scheduled': 'Scheduled',
        'common.completed': 'Completed',
        'common.error': 'Error',
        'common.retry': 'Retry',
        'common.vs': 'vs',
      };
      return translations[key] || key;
    },
  }),
}));

vi.mock('../Matches.css', () => ({}));

import Matches from '../Matches';

// --- Test data ---
const mockPlayers = [
  { playerId: 'p1', name: 'John Cena', currentWrestler: 'John Cena', wins: 10, losses: 2, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p2', name: 'The Rock', currentWrestler: 'The Rock', wins: 8, losses: 3, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p3', name: 'Undertaker', currentWrestler: 'Undertaker', wins: 15, losses: 5, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p4', name: 'Triple H', currentWrestler: 'Triple H', wins: 12, losses: 4, draws: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const scheduledMatch = {
  matchId: 'm1',
  date: '2024-06-15T20:00:00Z',
  matchType: 'singles',
  participants: ['p1', 'p2'],
  isChampionship: false,
  status: 'scheduled' as const,
  createdAt: '2024-06-01',
};

const completedMatch = {
  matchId: 'm2',
  date: '2024-06-10T19:00:00Z',
  matchType: 'triple-threat',
  stipulation: 'Ladder Match',
  participants: ['p1', 'p2', 'p3'],
  winners: ['p3'],
  losers: ['p1', 'p2'],
  isChampionship: true,
  status: 'completed' as const,
  createdAt: '2024-06-01',
};

const tagTeamMatch = {
  matchId: 'm3',
  date: '2024-06-12T19:00:00Z',
  matchType: 'tag',
  participants: ['p1', 'p2', 'p3', 'p4'],
  teams: [['p1', 'p2'], ['p3', 'p4']],
  winners: ['p1', 'p2'],
  losers: ['p3', 'p4'],
  winningTeam: 0,
  isChampionship: false,
  status: 'completed' as const,
  createdAt: '2024-06-01',
};

function renderMatches() {
  return render(
    <BrowserRouter>
      <Matches />
    </BrowserRouter>
  );
}

describe('Matches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders match list with scheduled and completed matches displayed differently', async () => {
    mockGetAllMatches.mockResolvedValue([scheduledMatch, completedMatch]);
    mockGetAllPlayers.mockResolvedValue(mockPlayers);

    renderMatches();

    await waitFor(() => {
      expect(screen.getByText('Matches')).toBeInTheDocument();
    });

    // Both match types are shown
    expect(screen.getByText('singles')).toBeInTheDocument();
    expect(screen.getByText('triple-threat')).toBeInTheDocument();

    // Scheduled match shows "Scheduled" status (in the status span, not just the filter button)
    const statusSpan = screen.getByText('Scheduled', { selector: '.status-scheduled' });
    expect(statusSpan).toBeInTheDocument();

    // Completed match shows winner/loser
    expect(screen.getByText('Winner:')).toBeInTheDocument();
    expect(screen.getByText('Undertaker')).toBeInTheDocument();

    // Completed match shows stipulation
    expect(screen.getByText('Ladder Match')).toBeInTheDocument();

    // Championship badge
    expect(screen.getByText('Championship')).toBeInTheDocument();
  });

  it('displays participant names resolved from player IDs', async () => {
    mockGetAllMatches.mockResolvedValue([scheduledMatch]);
    mockGetAllPlayers.mockResolvedValue(mockPlayers);

    renderMatches();

    await waitFor(() => {
      expect(screen.getByText('Matches')).toBeInTheDocument();
    });

    // Participants section shows player names (joined by comma for non-tag)
    expect(screen.getByText('John Cena, The Rock')).toBeInTheDocument();
  });

  it('renders tag team match with team-based results', async () => {
    mockGetAllMatches.mockResolvedValue([tagTeamMatch]);
    mockGetAllPlayers.mockResolvedValue(mockPlayers);

    renderMatches();

    await waitFor(() => {
      expect(screen.getByText('tag')).toBeInTheDocument();
    });

    // Winning and losing team labels displayed
    expect(screen.getByText('Winning Team:')).toBeInTheDocument();
    expect(screen.getByText('Losing Team:')).toBeInTheDocument();

    // Team members displayed (joined with &) — use getAllByText since names appear in both
    // participants section and results section
    const cenaRockTeam = screen.getAllByText('John Cena & The Rock');
    expect(cenaRockTeam.length).toBeGreaterThanOrEqual(1);
    const takerHHHTeam = screen.getAllByText('Undertaker & Triple H');
    expect(takerHHHTeam.length).toBeGreaterThanOrEqual(1);
  });
});
