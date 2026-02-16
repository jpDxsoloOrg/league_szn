import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const {
  mockGetAllPlayers,
  mockGetAllChampionships,
  mockGetAllTournaments,
  mockGetAllSeasons,
  mockGetAllEvents,
  mockGetAllStipulations,
  mockGetAllMatchTypes,
  mockScheduleMatch,
} = vi.hoisted(() => ({
  mockGetAllPlayers: vi.fn(),
  mockGetAllChampionships: vi.fn(),
  mockGetAllTournaments: vi.fn(),
  mockGetAllSeasons: vi.fn(),
  mockGetAllEvents: vi.fn(),
  mockGetAllStipulations: vi.fn(),
  mockGetAllMatchTypes: vi.fn(),
  mockScheduleMatch: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  matchesApi: { schedule: mockScheduleMatch },
  playersApi: { getAll: mockGetAllPlayers },
  championshipsApi: { getAll: mockGetAllChampionships },
  tournamentsApi: { getAll: mockGetAllTournaments },
  seasonsApi: { getAll: mockGetAllSeasons },
  eventsApi: { getAll: mockGetAllEvents },
  stipulationsApi: { getAll: mockGetAllStipulations },
  matchTypesApi: { getAll: mockGetAllMatchTypes },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const translations: Record<string, string> = {
        'scheduleMatch.matchFormat': 'Match Format',
        'scheduleMatch.selectMatchFormat': 'Select Match Format',
        'scheduleMatch.stipulation': 'Stipulation (Optional)',
        'scheduleMatch.noStipulation': 'Standard Match (No Stipulation)',
        'scheduleMatch.participants': 'Participants',
        'scheduleMatch.selected': 'Selected',
        'scheduleMatch.submit': 'Schedule Match',
        'scheduleMatch.success': 'Match scheduled successfully!',
        'scheduleMatch.error': 'Failed to schedule match',
        'scheduleMatch.minParticipantsError': 'Please select at least 2 participants',
        'scheduleMatch.tagTeam.selectTeams': 'Select Teams',
        'scheduleMatch.tagTeam.team': 'Team',
        'scheduleMatch.tagTeam.addTeam': 'Add Team',
        'scheduleMatch.tagTeam.noMembers': 'No members selected',
        'scheduleMatch.tagTeam.members': 'members',
        'scheduleMatch.tagTeam.minTeamsError': 'Please create at least 2 teams with 2+ members each',
        'scheduleMatch.event': 'Add to Event (Optional)',
        'scheduleMatch.noEvent': 'No Event (Standalone Match)',
        'scheduleMatch.eventHint': "Match will be automatically added to the event's card",
        'scheduleMatch.designation': 'Card Position',
        'events.designations.preShow': 'Pre-Show',
        'events.designations.opener': 'Opener',
        'events.designations.midcard': 'Midcard',
        'events.designations.coMain': 'Co-Main Event',
        'events.designations.mainEvent': 'Main Event',
        'common.unknown': 'Unknown',
        'common.delete': 'Delete',
      };
      return translations[key] || fallback || key;
    },
  }),
}));

vi.mock('../ScheduleMatch.css', () => ({}));
vi.mock('../SearchableSelect.css', () => ({}));

import ScheduleMatch from '../ScheduleMatch';

// --- Test data (use distinct wrestler names to avoid duplicate text issues) ---
const mockPlayers = [
  { playerId: 'p1', name: 'John Cena', currentWrestler: 'The Champ', wins: 10, losses: 2, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p2', name: 'Dwayne Johnson', currentWrestler: 'The Rock', wins: 8, losses: 3, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p3', name: 'Mark Calaway', currentWrestler: 'Undertaker', wins: 15, losses: 5, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p4', name: 'Paul Levesque', currentWrestler: 'Triple H', wins: 12, losses: 4, draws: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const mockChampionships = [
  { championshipId: 'c1', name: 'World Title', type: 'singles' as const, isActive: true, createdAt: '2024-01-01' },
];

const mockTournaments = [
  { tournamentId: 't1', name: 'King of the Ring', type: 'single-elimination' as const, status: 'in-progress' as const, participants: [], createdAt: '2024-01-01' },
];

const mockSeasons = [
  { seasonId: 's1', name: 'Season 1', startDate: '2024-01-01', status: 'active' as const, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const mockEvents = [
  { eventId: 'e1', name: 'WrestleMania', eventType: 'ppv', date: '2024-07-01T00:00:00Z', status: 'upcoming', matchCards: [], createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const mockStipulations = [
  { stipulationId: 'mt1', name: 'Ladder Match', description: 'Climb the ladder to retrieve the prize', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { stipulationId: 'mt2', name: 'Steel Cage', description: 'Escape or pin to win', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const mockMatchTypes = [
  { matchTypeId: 'mf1', name: 'Singles', description: 'One-on-one match', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { matchTypeId: 'mf2', name: 'Tag Team', description: 'Team-based match', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { matchTypeId: 'mf3', name: 'Triple Threat', description: 'Three competitors', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { matchTypeId: 'mf4', name: 'Fatal 4-Way', description: 'Four competitors', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

function setupDefaultMocks() {
  mockGetAllPlayers.mockResolvedValue(mockPlayers);
  mockGetAllChampionships.mockResolvedValue(mockChampionships);
  mockGetAllTournaments.mockResolvedValue(mockTournaments);
  mockGetAllSeasons.mockResolvedValue(mockSeasons);
  mockGetAllEvents.mockResolvedValue(mockEvents);
  mockGetAllStipulations.mockResolvedValue(mockStipulations);
  mockGetAllMatchTypes.mockResolvedValue(mockMatchTypes);
}

function renderScheduleMatch() {
  return render(
    <BrowserRouter>
      <ScheduleMatch />
    </BrowserRouter>
  );
}

describe('ScheduleMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state while data is being fetched', () => {
    mockGetAllPlayers.mockReturnValue(new Promise(() => {}));
    mockGetAllChampionships.mockReturnValue(new Promise(() => {}));
    mockGetAllTournaments.mockReturnValue(new Promise(() => {}));
    mockGetAllSeasons.mockReturnValue(new Promise(() => {}));
    mockGetAllEvents.mockReturnValue(new Promise(() => {}));
    mockGetAllStipulations.mockReturnValue(new Promise(() => {}));
    mockGetAllMatchTypes.mockReturnValue(new Promise(() => {}));

    renderScheduleMatch();

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders form with match format select, stipulation dropdown, and participant cards after data loads', async () => {
    setupDefaultMocks();

    renderScheduleMatch();

    // Wait for loading to complete — use the heading which is unique
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Schedule Match' })).toBeInTheDocument();
    });

    // Match format select is present with options
    const matchFormatSelect = screen.getByLabelText('Match Format');
    expect(matchFormatSelect).toBeInTheDocument();
    expect(screen.getByText('Singles')).toBeInTheDocument();

    // Stipulation dropdown is present with stipulations from API
    const stipulationSelect = screen.getByLabelText('Stipulation (Optional)');
    expect(stipulationSelect).toBeInTheDocument();
    expect(screen.getByText('Standard Match (No Stipulation)')).toBeInTheDocument();
    expect(screen.getByText('Ladder Match')).toBeInTheDocument();
    expect(screen.getByText('Steel Cage')).toBeInTheDocument();

    // Player cards are rendered in participants grid (use participant-name class)
    expect(screen.getByText('John Cena')).toBeInTheDocument();
    expect(screen.getByText('Dwayne Johnson')).toBeInTheDocument();
    expect(screen.getByText('Mark Calaway')).toBeInTheDocument();
    expect(screen.getByText('Paul Levesque')).toBeInTheDocument();

    // Wrestler names are also shown
    expect(screen.getByText('The Champ')).toBeInTheDocument();
    expect(screen.getByText('The Rock')).toBeInTheDocument();

    // Submit button
    expect(screen.getByRole('button', { name: 'Schedule Match' })).toBeInTheDocument();

    // Season is auto-selected (active season)
    const seasonSelect = screen.getByLabelText('Season');
    expect(seasonSelect).toHaveValue('s1');
  });

  it('loads players, championships, tournaments, seasons, events, stipulations, and match types on mount', async () => {
    setupDefaultMocks();

    renderScheduleMatch();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Schedule Match' })).toBeInTheDocument();
    });

    expect(mockGetAllPlayers).toHaveBeenCalledTimes(1);
    expect(mockGetAllChampionships).toHaveBeenCalledTimes(1);
    expect(mockGetAllTournaments).toHaveBeenCalledTimes(1);
    expect(mockGetAllSeasons).toHaveBeenCalledTimes(1);
    expect(mockGetAllEvents).toHaveBeenCalledTimes(1);
    expect(mockGetAllStipulations).toHaveBeenCalledTimes(1);
    expect(mockGetAllMatchTypes).toHaveBeenCalledTimes(1);
  });

  it('switches to tag team mode when match format changes to tag', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();

    renderScheduleMatch();

    await waitFor(() => {
      expect(screen.getByLabelText('Match Format')).toBeInTheDocument();
    });

    // Change to tag team (value is now the match type name from DB)
    await user.selectOptions(screen.getByLabelText('Match Format'), 'Tag Team');

    // Tag team UI elements appear
    expect(screen.getByText('Select Teams')).toBeInTheDocument();
    expect(screen.getByText('Team 1')).toBeInTheDocument();
    expect(screen.getByText('Team 2')).toBeInTheDocument();
    expect(screen.getByText(/Add Team/)).toBeInTheDocument();

    // Team summary shows member counts
    expect(screen.getAllByText(/0 members/).length).toBeGreaterThanOrEqual(2);
  });

  it('submits singles match with correct data when participants are selected', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    mockScheduleMatch.mockResolvedValue({ matchId: 'new-match' });

    renderScheduleMatch();

    await waitFor(() => {
      expect(screen.getByText('John Cena')).toBeInTheDocument();
    });

    // Select match format (no longer defaults to singles)
    await user.selectOptions(screen.getByLabelText('Match Format'), 'Singles');

    // Click participant cards to select two players
    await user.click(screen.getByText('John Cena').closest('.participant-card')!);
    await user.click(screen.getByText('Dwayne Johnson').closest('.participant-card')!);

    // Verify selected count
    expect(screen.getByText('Selected: 2')).toBeInTheDocument();

    // Submit the form
    await user.click(screen.getByRole('button', { name: 'Schedule Match' }));

    await waitFor(() => {
      expect(mockScheduleMatch).toHaveBeenCalledTimes(1);
    });

    const callArg = mockScheduleMatch.mock.calls[0]![0];
    expect(callArg.matchFormat).toBe('Singles');
    expect(callArg.participants).toEqual(['p1', 'p2']);
    expect(callArg.status).toBe('scheduled');
    expect(callArg.seasonId).toBe('s1');
  });

  it('shows validation error when submitting with fewer than 2 participants', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();

    renderScheduleMatch();

    await waitFor(() => {
      expect(screen.getByText('John Cena')).toBeInTheDocument();
    });

    // Select match format first (no longer defaults to singles)
    await user.selectOptions(screen.getByLabelText('Match Format'), 'Singles');

    // Select only one participant
    await user.click(screen.getByText('John Cena').closest('.participant-card')!);

    // Submit
    await user.click(screen.getByRole('button', { name: 'Schedule Match' }));

    await waitFor(() => {
      expect(screen.getByText('Please select at least 2 participants')).toBeInTheDocument();
    });

    // API should not have been called
    expect(mockScheduleMatch).not.toHaveBeenCalled();
  });
});
