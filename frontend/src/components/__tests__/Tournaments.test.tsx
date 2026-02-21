import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetAllTournaments, mockGetAllPlayers } = vi.hoisted(() => ({
  mockGetAllTournaments: vi.fn(),
  mockGetAllPlayers: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  tournamentsApi: {
    getAll: mockGetAllTournaments,
  },
  playersApi: {
    getAll: mockGetAllPlayers,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'tournaments.title': 'Tournaments',
        'tournaments.loading': 'Loading tournaments...',
        'tournaments.noTournaments': 'No tournaments available.',
        'tournaments.type': 'Type',
        'tournaments.participants': 'Participants',
        'tournaments.winner': 'Winner',
        'tournaments.viewDetails': 'View Details',
        'tournaments.status': 'Status',
        'tournaments.singleElimination': 'Single Elimination',
        'tournaments.roundRobin': 'Round Robin',
        'tournaments.statusUpcoming': 'Upcoming',
        'tournaments.statusInProgress': 'In Progress',
        'tournaments.statusCompleted': 'Completed',
        'tournaments.standings': 'Standings',
        'tournaments.bracket': 'Bracket',
        'tournaments.round': 'Round',
        'tournaments.summaryLeader': 'Leader',
        'tournaments.summaryPoints': 'Points',
        'tournaments.summaryGap': 'Gap',
        'tournaments.summaryGapValue': '{{count}} pts',
        'tournaments.table.rank': 'Rank',
        'tournaments.table.player': 'Player',
        'tournaments.table.w': 'W',
        'tournaments.table.l': 'L',
        'tournaments.table.d': 'D',
        'tournaments.table.points': 'Pts',
        'common.unknown': 'Unknown',
        'common.tbd': 'TBD',
        'common.vs': 'vs',
        'common.error': 'Error',
        'common.retry': 'Retry',
      };
      return translations[key] || key;
    },
  }),
}));

// Suppress CSS import
vi.mock('../Tournaments.css', () => ({}));

import Tournaments from '../Tournaments';

// --- Test data ---
const mockPlayers = [
  { playerId: 'p1', name: 'John Cena', currentWrestler: 'John Cena', wins: 10, losses: 2, draws: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p2', name: 'The Rock', currentWrestler: 'The Rock', wins: 8, losses: 3, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p3', name: 'Undertaker', currentWrestler: 'Undertaker', wins: 15, losses: 5, draws: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p4', name: 'Triple H', currentWrestler: 'Triple H', wins: 12, losses: 4, draws: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const singleEliminationTournament = {
  tournamentId: 't1',
  name: 'King of the Ring 2024',
  type: 'single-elimination' as const,
  status: 'in-progress' as const,
  participants: ['p1', 'p2', 'p3', 'p4'],
  brackets: {
    rounds: [
      {
        roundNumber: 1,
        matches: [
          { participant1: 'p1', participant2: 'p2', winner: 'p1' },
          { participant1: 'p3', participant2: 'p4', winner: undefined },
        ],
      },
      {
        roundNumber: 2,
        matches: [
          { participant1: 'p1', participant2: undefined, winner: undefined },
        ],
      },
    ],
  },
  createdAt: '2024-01-01',
};

const roundRobinTournament = {
  tournamentId: 't2',
  name: 'G1 Climax Style',
  type: 'round-robin' as const,
  status: 'in-progress' as const,
  participants: ['p1', 'p2', 'p3'],
  standings: {
    p1: { wins: 2, losses: 0, draws: 0, points: 4 },
    p2: { wins: 1, losses: 1, draws: 0, points: 2 },
    p3: { wins: 0, losses: 2, draws: 0, points: 0 },
  },
  createdAt: '2024-01-01',
};

const completedTournament = {
  tournamentId: 't3',
  name: 'Royal Rumble Classic',
  type: 'single-elimination' as const,
  status: 'completed' as const,
  participants: ['p1', 'p2'],
  winner: 'p2',
  createdAt: '2024-01-01',
};

function renderTournaments() {
  return render(
    <BrowserRouter>
      <Tournaments />
    </BrowserRouter>
  );
}

describe('Tournaments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tournament list with names, types, and statuses', async () => {
    mockGetAllTournaments.mockResolvedValue([
      singleEliminationTournament,
      roundRobinTournament,
      completedTournament,
    ]);
    mockGetAllPlayers.mockResolvedValue(mockPlayers);

    renderTournaments();

    await waitFor(() => {
      expect(screen.getByText('Tournaments')).toBeInTheDocument();
    });

    // Tournament names
    expect(screen.getByText('King of the Ring 2024')).toBeInTheDocument();
    expect(screen.getByText('G1 Climax Style')).toBeInTheDocument();
    expect(screen.getByText('Royal Rumble Classic')).toBeInTheDocument();

    // Winner for completed tournament
    expect(screen.getByText('The Rock')).toBeInTheDocument();

    // Status badges present
    const inProgressBadges = screen.getAllByText('In Progress');
    expect(inProgressBadges.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows bracket view for single-elimination tournament in detail modal', async () => {
    mockGetAllTournaments.mockResolvedValue([singleEliminationTournament]);
    mockGetAllPlayers.mockResolvedValue(mockPlayers);

    renderTournaments();

    await waitFor(() => {
      expect(screen.getByText('King of the Ring 2024')).toBeInTheDocument();
    });

    // Click View Details to open modal
    fireEvent.click(screen.getByText('View Details'));

    // Bracket heading should appear
    expect(screen.getByText('Bracket')).toBeInTheDocument();

    // Round labels
    expect(screen.getByText('Round 1')).toBeInTheDocument();
    expect(screen.getByText('Round 2')).toBeInTheDocument();

    // Participant names in bracket (may appear in both the card list and bracket)
    expect(screen.getAllByText('John Cena').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('The Rock').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Undertaker').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Triple H').length).toBeGreaterThanOrEqual(1);

    // TBD for unfilled bracket slot
    expect(screen.getByText('TBD')).toBeInTheDocument();
  });

  it('shows standings table for round-robin tournament in detail modal', async () => {
    mockGetAllTournaments.mockResolvedValue([roundRobinTournament]);
    mockGetAllPlayers.mockResolvedValue(mockPlayers);

    renderTournaments();

    await waitFor(() => {
      expect(screen.getByText('G1 Climax Style')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('View Details'));

    // Standings heading
    expect(screen.getByText('Standings')).toBeInTheDocument();
    expect(screen.getByText('Leader')).toBeInTheDocument();
    expect(screen.getByText('Gap')).toBeInTheDocument();

    // Table headers
    expect(screen.getByText('Rank')).toBeInTheDocument();
    expect(screen.getByText('Player')).toBeInTheDocument();
    expect(screen.getByText('Pts')).toBeInTheDocument();

    // Player names in standings (sorted by points: p1=4, p2=2, p3=0)
    const rows = screen.getAllByRole('row');
    // Header row + 3 data rows
    expect(rows).toHaveLength(4);

    // Points displayed in .points cells (p1=4, p2=2, p3=0)
    const pointsCells = document.querySelectorAll('.points');
    expect(pointsCells).toHaveLength(3);
    const pointsValues = Array.from(pointsCells).map(cell => cell.textContent);
    expect(pointsValues).toEqual(['4', '2', '0']);
  });

  it('handles empty state when no tournaments exist', async () => {
    mockGetAllTournaments.mockResolvedValue([]);
    mockGetAllPlayers.mockResolvedValue(mockPlayers);

    renderTournaments();

    await waitFor(() => {
      expect(screen.getByText('No tournaments available.')).toBeInTheDocument();
    });

    expect(screen.getByText('Tournaments')).toBeInTheDocument();
  });
});
