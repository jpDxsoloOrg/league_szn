import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Match, Player } from '../../../types';

// --- Hoisted mocks ---
const { mockRecordResult } = vi.hoisted(() => ({
  mockRecordResult: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  matchesApi: {
    recordResult: mockRecordResult,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'recordResult.selectWinners': 'Select Winner(s)',
        'recordResult.selectWinningTeamTitle': 'Select Winning Team',
        'recordResult.winner': 'Winner',
        'recordResult.selectWinner': 'Please select at least one winner',
        'recordResult.selectWinningTeam': 'Please select the winning team',
        'recordResult.error': 'Failed to record result',
        'match.starRating': 'Star Rating',
        'match.clearRating': 'Clear',
        'match.matchOfTheNight': 'Match of the Night',
        'common.unknown': 'Unknown',
      };
      return translations[key] || key;
    },
  }),
}));

vi.mock('../MatchResultForm.css', () => ({}));

import MatchResultForm from '../MatchResultForm';

// --- Test data ---
const mockPlayers: Player[] = [
  { playerId: 'p1', name: 'John Cena', currentWrestler: 'John Cena', wins: 10, losses: 2, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p2', name: 'The Rock', currentWrestler: 'The Rock', wins: 8, losses: 3, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p3', name: 'Undertaker', currentWrestler: 'Undertaker', wins: 15, losses: 5, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p4', name: 'Triple H', currentWrestler: 'Triple H', wins: 12, losses: 4, draws: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const singlesMatch: Match = {
  matchId: 'm1',
  date: '2024-06-15T20:00:00Z',
  matchFormat: 'singles',
  participants: ['p1', 'p2'],
  isChampionship: false,
  status: 'scheduled',
  createdAt: '2024-06-01',
};

const tagMatch: Match = {
  matchId: 'm2',
  date: '2024-06-16T20:00:00Z',
  matchFormat: 'tag',
  participants: ['p1', 'p2', 'p3', 'p4'],
  teams: [['p1', 'p2'], ['p3', 'p4']],
  isChampionship: false,
  status: 'scheduled',
  createdAt: '2024-06-01',
};

describe('MatchResultForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders singles match with participant names visible', () => {
    render(
      <MatchResultForm
        match={singlesMatch}
        players={mockPlayers}
        tagTeams={[]}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Select Winner(s)')).toBeInTheDocument();
    expect(screen.getByText('John Cena (John Cena)')).toBeInTheDocument();
    expect(screen.getByText('The Rock (The Rock)')).toBeInTheDocument();
  });

  it('clicking a participant selects them as winner (visible winner-badge)', async () => {
    const user = userEvent.setup();
    render(
      <MatchResultForm
        match={singlesMatch}
        players={mockPlayers}
        tagTeams={[]}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const cenaOption = screen.getByText('John Cena (John Cena)').closest('.participant-option');
    expect(cenaOption).not.toBeNull();
    await user.click(cenaOption!);

    expect(cenaOption!.classList.contains('winner')).toBe(true);
    expect(screen.getByText('Winner')).toBeInTheDocument();
  });

  it('submit calls matchesApi.recordResult with winners + losers', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    mockRecordResult.mockResolvedValue({});

    render(
      <MatchResultForm
        match={singlesMatch}
        players={mockPlayers}
        tagTeams={[]}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />
    );

    const cenaOption = screen.getByText('John Cena (John Cena)').closest('.participant-option');
    await user.click(cenaOption!);

    const recordBtn = screen.getByRole('button', { name: 'Record Result' });
    expect(recordBtn).not.toBeDisabled();
    await user.click(recordBtn);

    await waitFor(() => {
      expect(mockRecordResult).toHaveBeenCalledWith('m1', {
        winners: ['p1'],
        losers: ['p2'],
      });
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('draw toggle submits with isDraw: true', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    mockRecordResult.mockResolvedValue({});

    render(
      <MatchResultForm
        match={singlesMatch}
        players={mockPlayers}
        tagTeams={[]}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />
    );

    const drawCheckbox = screen.getByRole('checkbox', { name: /Draw/i });
    await user.click(drawCheckbox);

    const recordBtn = screen.getByRole('button', { name: 'Record Result' });
    expect(recordBtn).not.toBeDisabled();
    await user.click(recordBtn);

    await waitFor(() => {
      expect(mockRecordResult).toHaveBeenCalledWith('m1', {
        winners: ['p1', 'p2'],
        losers: [],
        isDraw: true,
      });
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('tag team match shows team options when match.teams is set', () => {
    render(
      <MatchResultForm
        match={tagMatch}
        players={mockPlayers}
        tagTeams={[]}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Select Winning Team')).toBeInTheDocument();
    // Two team options visible
    const teamOptions = document.querySelectorAll('.team-option');
    expect(teamOptions.length).toBe(2);
    // First team label "John Cena & The Rock"
    expect(screen.getByText('John Cena & The Rock')).toBeInTheDocument();
    expect(screen.getByText('Undertaker & Triple H')).toBeInTheDocument();
  });

  it('cancel button calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <MatchResultForm
        match={singlesMatch}
        players={mockPlayers}
        tagTeams={[]}
        onSuccess={vi.fn()}
        onCancel={onCancel}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelBtn);

    expect(onCancel).toHaveBeenCalled();
  });
});
