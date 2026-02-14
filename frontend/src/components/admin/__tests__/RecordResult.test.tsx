import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetAllMatches, mockGetAllPlayers, mockGetAllEvents, mockRecordResult, mockGetAllStipulations } = vi.hoisted(() => ({
  mockGetAllMatches: vi.fn(),
  mockGetAllPlayers: vi.fn(),
  mockGetAllEvents: vi.fn(),
  mockRecordResult: vi.fn(),
  mockGetAllStipulations: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  matchesApi: {
    getAll: mockGetAllMatches,
    recordResult: mockRecordResult,
  },
  playersApi: { getAll: mockGetAllPlayers },
  eventsApi: { getAll: mockGetAllEvents },
  stipulationsApi: { getAll: mockGetAllStipulations },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'recordResult.title': 'Record Match Results',
        'recordResult.scheduledMatches': 'Scheduled Matches',
        'recordResult.recordResult': 'Record Result',
        'recordResult.selectWinners': 'Select Winner(s)',
        'recordResult.selectWinningTeamTitle': 'Select Winning Team',
        'recordResult.team': 'Team',
        'recordResult.winner': 'Winner',
        'recordResult.selectWinner': 'Please select at least one winner',
        'recordResult.selectWinningTeam': 'Please select the winning team',
        'recordResult.success': 'Match result recorded successfully!',
        'recordResult.error': 'Failed to record result',
        'recordResult.selectMatch': 'Select a match to record its result',
        'recordResult.noScheduledMatches': 'No scheduled matches to record results for.',
        'common.unknown': 'Unknown',
      };
      return translations[key] || key;
    },
  }),
}));

vi.mock('../RecordResult.css', () => ({}));
vi.mock('../SearchableSelect.css', () => ({}));

import RecordResult from '../RecordResult';

// --- Test data ---
const mockPlayers = [
  { playerId: 'p1', name: 'John Cena', currentWrestler: 'John Cena', wins: 10, losses: 2, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p2', name: 'The Rock', currentWrestler: 'The Rock', wins: 8, losses: 3, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p3', name: 'Undertaker', currentWrestler: 'Undertaker', wins: 15, losses: 5, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p4', name: 'Triple H', currentWrestler: 'Triple H', wins: 12, losses: 4, draws: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const singlesMatch = {
  matchId: 'm1',
  date: '2024-06-15T20:00:00Z',
  matchFormat: 'singles',
  participants: ['p1', 'p2'],
  isChampionship: false,
  status: 'scheduled' as const,
  createdAt: '2024-06-01',
};

const tagMatch = {
  matchId: 'm2',
  date: '2024-06-16T20:00:00Z',
  matchFormat: 'tag',
  participants: ['p1', 'p2', 'p3', 'p4'],
  teams: [['p1', 'p2'], ['p3', 'p4']],
  isChampionship: false,
  status: 'scheduled' as const,
  createdAt: '2024-06-01',
};

const matchForEvent = {
  matchId: 'm3',
  date: '2024-07-01T20:00:00Z',
  matchFormat: 'singles',
  stipulationId: 'stip-1',
  participants: ['p3', 'p4'],
  isChampionship: true,
  status: 'scheduled' as const,
  createdAt: '2024-06-01',
};

const mockEvents = [
  {
    eventId: 'e1',
    name: 'WrestleMania',
    eventType: 'ppv',
    date: '2024-07-01T00:00:00Z',
    status: 'upcoming' as const,
    matchCards: [{ matchId: 'm3', position: 1, designation: 'main-event' }],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
];

function setupDefaultMocks() {
  mockGetAllMatches.mockResolvedValue([singlesMatch, tagMatch, matchForEvent]);
  mockGetAllPlayers.mockResolvedValue(mockPlayers);
  mockGetAllEvents.mockResolvedValue(mockEvents);
  mockGetAllStipulations.mockResolvedValue([
    { stipulationId: 'stip-1', name: 'Steel Cage', createdAt: '', updatedAt: '' },
    { stipulationId: 'stip-2', name: 'Ladder', createdAt: '', updatedAt: '' },
  ]);
}

function renderRecordResult() {
  return render(
    <BrowserRouter>
      <RecordResult />
    </BrowserRouter>
  );
}

describe('RecordResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state while data is being fetched', () => {
    mockGetAllMatches.mockReturnValue(new Promise(() => {}));
    mockGetAllPlayers.mockReturnValue(new Promise(() => {}));
    mockGetAllEvents.mockReturnValue(new Promise(() => {}));
    mockGetAllStipulations.mockReturnValue(new Promise(() => {}));

    renderRecordResult();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('lists scheduled matches after loading', async () => {
    setupDefaultMocks();

    renderRecordResult();

    await waitFor(() => {
      expect(screen.getByText('Record Match Results')).toBeInTheDocument();
    });

    // The API was called requesting scheduled matches
    expect(mockGetAllMatches).toHaveBeenCalledWith({ status: 'scheduled' });

    // Prompt to select a match
    expect(screen.getByText('Select a match to record its result')).toBeInTheDocument();
  });

  it('selects a singles match and shows winner selection with participant names', async () => {
    const user = userEvent.setup();
    // Only return standalone matches (no event) for simplicity
    mockGetAllMatches.mockResolvedValue([singlesMatch]);
    mockGetAllPlayers.mockResolvedValue(mockPlayers);
    mockGetAllEvents.mockResolvedValue([]);
    mockGetAllStipulations.mockResolvedValue([]);

    renderRecordResult();

    await waitFor(() => {
      expect(screen.getByText('Record Match Results')).toBeInTheDocument();
    });

    // Click the singles match item
    const matchItem = screen.getByText('singles').closest('.match-item');
    expect(matchItem).not.toBeNull();
    await user.click(matchItem!);

    // Winner selection UI appears
    await waitFor(() => {
      expect(screen.getByText('Select Winner(s)')).toBeInTheDocument();
    });

    // Participant names with wrestler names shown
    expect(screen.getByText('John Cena (John Cena)')).toBeInTheDocument();
    expect(screen.getByText('The Rock (The Rock)')).toBeInTheDocument();

    // Record Result button present but disabled (no winner selected)
    const recordBtn = screen.getByRole('button', { name: 'Record Result' });
    expect(recordBtn).toBeDisabled();
  });

  it('submits result for a singles match after selecting a winner', async () => {
    const user = userEvent.setup();
    mockGetAllMatches.mockResolvedValue([singlesMatch]);
    mockGetAllPlayers.mockResolvedValue(mockPlayers);
    mockGetAllEvents.mockResolvedValue([]);
    mockGetAllStipulations.mockResolvedValue([]);
    mockRecordResult.mockResolvedValue({ ...singlesMatch, status: 'completed', winners: ['p1'], losers: ['p2'] });
    // After recording, reload returns empty (match no longer scheduled)
    mockGetAllMatches.mockResolvedValueOnce([singlesMatch]).mockResolvedValueOnce([]);

    renderRecordResult();

    await waitFor(() => {
      expect(screen.getByText('Record Match Results')).toBeInTheDocument();
    });

    // Click the match
    const matchItem = screen.getByText('singles').closest('.match-item');
    await user.click(matchItem!);

    await waitFor(() => {
      expect(screen.getByText('Select Winner(s)')).toBeInTheDocument();
    });

    // Click John Cena as winner
    const cenaOption = screen.getByText('John Cena (John Cena)').closest('.participant-option');
    await user.click(cenaOption!);

    // Record Result button is now enabled
    const recordBtn = screen.getByRole('button', { name: 'Record Result' });
    expect(recordBtn).not.toBeDisabled();

    // Submit
    await user.click(recordBtn);

    await waitFor(() => {
      expect(mockRecordResult).toHaveBeenCalledWith('m1', {
        winners: ['p1'],
        losers: ['p2'],
      });
    });

    // Success message
    await waitFor(() => {
      expect(screen.getByText('Match result recorded successfully!')).toBeInTheDocument();
    });
  });

  it('handles API error when recording result', async () => {
    const user = userEvent.setup();
    mockGetAllMatches.mockResolvedValue([singlesMatch]);
    mockGetAllPlayers.mockResolvedValue(mockPlayers);
    mockGetAllEvents.mockResolvedValue([]);
    mockGetAllStipulations.mockResolvedValue([]);
    mockRecordResult.mockRejectedValue(new Error('Server error'));

    renderRecordResult();

    await waitFor(() => {
      expect(screen.getByText('Record Match Results')).toBeInTheDocument();
    });

    // Select match
    const matchItem = screen.getByText('singles').closest('.match-item');
    await user.click(matchItem!);

    await waitFor(() => {
      expect(screen.getByText('Select Winner(s)')).toBeInTheDocument();
    });

    // Select winner
    const cenaOption = screen.getByText('John Cena (John Cena)').closest('.participant-option');
    await user.click(cenaOption!);

    // Submit
    await user.click(screen.getByRole('button', { name: 'Record Result' }));

    // Error message
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });
});
