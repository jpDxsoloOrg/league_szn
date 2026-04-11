import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Hoisted mocks ---
const {
  mockGetAllMatches,
  mockUpdateMatch,
  mockGetAllPlayers,
  mockGetAllChampionships,
  mockGetAllTournaments,
  mockGetAllSeasons,
  mockGetAllEvents,
  mockGetAllStipulations,
  mockGetAllMatchTypes,
  mockGetAllTagTeams,
  mockGetAllDivisions,
} = vi.hoisted(() => ({
  mockGetAllMatches: vi.fn(),
  mockUpdateMatch: vi.fn(),
  mockGetAllPlayers: vi.fn(),
  mockGetAllChampionships: vi.fn(),
  mockGetAllTournaments: vi.fn(),
  mockGetAllSeasons: vi.fn(),
  mockGetAllEvents: vi.fn(),
  mockGetAllStipulations: vi.fn(),
  mockGetAllMatchTypes: vi.fn(),
  mockGetAllTagTeams: vi.fn(),
  mockGetAllDivisions: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  matchesApi: {
    getAll: mockGetAllMatches,
    update: mockUpdateMatch,
  },
  playersApi: { getAll: mockGetAllPlayers },
  championshipsApi: { getAll: mockGetAllChampionships },
  tournamentsApi: { getAll: mockGetAllTournaments },
  seasonsApi: { getAll: mockGetAllSeasons },
  eventsApi: { getAll: mockGetAllEvents },
  stipulationsApi: { getAll: mockGetAllStipulations },
  matchTypesApi: { getAll: mockGetAllMatchTypes },
  tagTeamsApi: { getAll: mockGetAllTagTeams },
  divisionsApi: { getAll: mockGetAllDivisions },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock('../../admin/ScheduleMatch.css', () => ({}));
vi.mock('../MatchEditForm.css', () => ({}));
vi.mock('../../admin/SearchableSelect.css', () => ({}));

import MatchEditForm from '../MatchEditForm';

// --- Test data ---
const mockPlayers = [
  {
    playerId: 'p1',
    name: 'John Cena',
    currentWrestler: 'John Cena',
    wins: 10,
    losses: 2,
    draws: 0,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    playerId: 'p2',
    name: 'The Rock',
    currentWrestler: 'The Rock',
    wins: 8,
    losses: 3,
    draws: 0,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    playerId: 'p3',
    name: 'Undertaker',
    currentWrestler: 'Undertaker',
    wins: 15,
    losses: 5,
    draws: 0,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
];

const scheduledMatch = {
  matchId: 'm1',
  date: '2024-06-15T20:00:00Z',
  matchFormat: 'singles',
  participants: ['p1', 'p2'],
  isChampionship: false,
  status: 'scheduled' as const,
  createdAt: '2024-06-01',
};

const completedMatch = {
  matchId: 'm2',
  date: '2024-06-15T20:00:00Z',
  matchFormat: 'singles',
  participants: ['p1', 'p2'],
  isChampionship: false,
  status: 'completed' as const,
  createdAt: '2024-06-01',
};

const mockEvents = [
  {
    eventId: 'e1',
    name: 'WrestleMania',
    eventType: 'ppv',
    date: '2024-07-01T00:00:00Z',
    status: 'upcoming' as const,
    matchCards: [{ matchId: 'm1', position: 1, designation: 'main-event' }],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
];

const mockMatchTypes = [
  { matchTypeId: 'mt1', name: 'singles', createdAt: '', updatedAt: '' },
  { matchTypeId: 'mt2', name: 'tag team', createdAt: '', updatedAt: '' },
  { matchTypeId: 'mt3', name: 'triple threat', createdAt: '', updatedAt: '' },
];

function setupDefaultMocks() {
  mockGetAllMatches.mockResolvedValue([scheduledMatch]);
  mockGetAllPlayers.mockResolvedValue(mockPlayers);
  mockGetAllChampionships.mockResolvedValue([]);
  mockGetAllTournaments.mockResolvedValue([]);
  mockGetAllSeasons.mockResolvedValue([]);
  mockGetAllEvents.mockResolvedValue(mockEvents);
  mockGetAllStipulations.mockResolvedValue([]);
  mockGetAllMatchTypes.mockResolvedValue(mockMatchTypes);
  mockGetAllTagTeams.mockResolvedValue([]);
  mockGetAllDivisions.mockResolvedValue([]);
}

describe('MatchEditForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads existing match data into form fields', async () => {
    setupDefaultMocks();

    render(
      <MatchEditForm matchId="m1" onSuccess={vi.fn()} onCancel={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Match Format')).toBeInTheDocument();
    });

    const matchFormatSelect = screen.getByLabelText('Match Format') as HTMLSelectElement;
    expect(matchFormatSelect.value).toBe('singles');

    // Participants should be shown (names appear in both `.participant-name` and `.participant-wrestler` divs)
    expect(screen.getAllByText('John Cena').length).toBeGreaterThan(0);
    expect(screen.getAllByText('The Rock').length).toBeGreaterThan(0);

    // Selected count reflects the 2 pre-filled participants
    expect(screen.getByText(/scheduleMatch.selected: 2/)).toBeInTheDocument();
  });

  it('submits with changed format calls matchesApi.update', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    mockUpdateMatch.mockResolvedValue({ ...scheduledMatch });
    const onSuccess = vi.fn();

    render(
      <MatchEditForm matchId="m1" onSuccess={onSuccess} onCancel={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Match Format')).toBeInTheDocument();
    });

    // Change match format - this clears participants
    await user.selectOptions(screen.getByLabelText('Match Format'), 'triple threat');

    // Re-select 2 participants (required minimum). Each player's name appears in both
    // `.participant-name` and `.participant-wrestler`, so grab the first match (the card div).
    const johnMatches = screen.getAllByText('John Cena');
    const rockMatches = screen.getAllByText('The Rock');
    await user.click(johnMatches[0] as HTMLElement);
    await user.click(rockMatches[0] as HTMLElement);

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockUpdateMatch).toHaveBeenCalled();
    });

    const [calledId, payload] = mockUpdateMatch.mock.calls[0];
    expect(calledId).toBe('m1');
    expect(payload.matchFormat).toBe('triple threat');
    expect(payload.participants).toEqual(expect.arrayContaining(['p1', 'p2']));
    expect(onSuccess).toHaveBeenCalled();
  });

  it('when lockedEventId is provided, eventId in update payload matches lockedEventId', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    mockUpdateMatch.mockResolvedValue({ ...scheduledMatch });
    const onSuccess = vi.fn();

    render(
      <MatchEditForm
        matchId="m1"
        lockedEventId="e1"
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Match Format')).toBeInTheDocument();
    });

    // Event dropdown should NOT be rendered (locked)
    expect(screen.queryByLabelText('Add to Event (Optional)')).not.toBeInTheDocument();

    // Designation is still shown
    expect(screen.getByLabelText('Card Position')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockUpdateMatch).toHaveBeenCalled();
    });

    const [, payload] = mockUpdateMatch.mock.calls[0];
    expect(payload.eventId).toBe('e1');
    expect(payload.designation).toBeDefined();
    expect(onSuccess).toHaveBeenCalled();
  });

  it('Cancel button calls onCancel', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    const onCancel = vi.fn();

    render(
      <MatchEditForm matchId="m1" onSuccess={vi.fn()} onCancel={onCancel} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows error message when match is already completed', async () => {
    setupDefaultMocks();
    mockGetAllMatches.mockResolvedValue([completedMatch]);

    render(
      <MatchEditForm matchId="m2" onSuccess={vi.fn()} onCancel={vi.fn()} />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Only scheduled matches can be edited/)
      ).toBeInTheDocument();
    });

    // Cancel button should still be rendered in the error state
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
