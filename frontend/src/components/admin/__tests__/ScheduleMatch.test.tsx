import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';

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
  mockGetAllTagTeams,
  mockGetAllDivisions,
  mockGetCheckIns,
  mockGetChallenges,
} = vi.hoisted(() => ({
  mockGetAllPlayers: vi.fn(),
  mockGetAllChampionships: vi.fn(),
  mockGetAllTournaments: vi.fn(),
  mockGetAllSeasons: vi.fn(),
  mockGetAllEvents: vi.fn(),
  mockGetAllStipulations: vi.fn(),
  mockGetAllMatchTypes: vi.fn(),
  mockScheduleMatch: vi.fn(),
  mockGetAllTagTeams: vi.fn(),
  mockGetAllDivisions: vi.fn(),
  mockGetCheckIns: vi.fn(),
  mockGetChallenges: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  challengesApi: { getAll: mockGetChallenges },
  matchesApi: { schedule: mockScheduleMatch },
  playersApi: { getAllIncludingHidden: mockGetAllPlayers, getBookingSummary: vi.fn().mockResolvedValue({}) },
  championshipsApi: { getAll: mockGetAllChampionships },
  tournamentsApi: { getAll: mockGetAllTournaments },
  seasonsApi: { getAll: mockGetAllSeasons },
  eventsApi: { getAll: mockGetAllEvents, getCheckIns: mockGetCheckIns },
  stipulationsApi: { getAll: mockGetAllStipulations },
  matchTypesApi: { getAll: mockGetAllMatchTypes },
  tagTeamsApi: { getAll: mockGetAllTagTeams },
  divisionsApi: { getAll: mockGetAllDivisions },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: string | Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'scheduleMatch.matchFormat': 'Match Format',
        'scheduleMatch.linkedTitleGone': 'Title is gone',
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
        'matches.slots.signupModeToggle': 'Open match for signups',
        'matches.slots.slotsRequiredLabel': 'Number of spots',
        'matches.slots.editorLabel': 'Slots',
        'matches.slots.openOption': '— Open spot —',
        'matches.slots.lockToggle': 'Lock',
        'matches.slots.teamLabelPlaceholder': 'Team (optional)',
      };
      if (translations[key]) return translations[key];
      // Support both `t(key, 'fallback string')` and `t(key, { defaultValue: 'x' })`
      if (typeof options === 'string') return options;
      if (options && typeof options === 'object' && typeof options.defaultValue === 'string') {
        return options.defaultValue.replace('{{sources}}', String(options.sources));
      }
      return key;
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
  { championshipId: 'c2', name: 'Tag Titles', type: 'tag' as const, isActive: true, createdAt: '2024-01-01' },
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

const hiddenPlayer = {
  playerId: 'p5', name: 'Newbie', currentWrestler: 'Needs Wrestler',
  wins: 0, losses: 0, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01',
};

function setupDefaultMocks() {
  mockGetAllPlayers.mockResolvedValue(mockPlayers);
  mockGetAllChampionships.mockResolvedValue(mockChampionships);
  mockGetAllTournaments.mockResolvedValue(mockTournaments);
  mockGetAllSeasons.mockResolvedValue(mockSeasons);
  mockGetAllEvents.mockResolvedValue(mockEvents);
  mockGetAllStipulations.mockResolvedValue(mockStipulations);
  mockGetAllMatchTypes.mockResolvedValue(mockMatchTypes);
  mockGetAllTagTeams.mockResolvedValue([]);
  mockGetAllDivisions.mockResolvedValue([]);
  mockGetChallenges.mockResolvedValue([]);
  mockGetCheckIns.mockResolvedValue({
    available: [{ playerId: 'p1', name: 'John Cena', currentWrestler: 'The Champ' }],
    tentative: [{ playerId: 'p2', name: 'Dwayne Johnson', currentWrestler: 'The Rock' }],
    unavailable: [{ playerId: 'p3', name: 'Mark Calaway', currentWrestler: 'Undertaker' }],
    noResponse: [{ playerId: 'p4', name: 'Paul Levesque', currentWrestler: 'Triple H' }],
  });
}

/**
 * The event field is a SearchableSelect (an input + click-through option
 * list), not a native <select>, so it can't be driven with selectOptions.
 */
async function selectEvent(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText('Add to Event (Optional)'));
  await user.click(await screen.findByText(/WrestleMania/));
}

/** Opens the participants popup and clicks each named player's option. */
async function pickParticipants(
  user: ReturnType<typeof userEvent.setup>,
  optionLabels: string[],
) {
  await user.click(screen.getByRole('button', { name: /Add participants…|\d+ selected/ }));
  for (const label of optionLabels) {
    await user.click(screen.getByText(label));
  }
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
    mockGetAllTagTeams.mockReturnValue(new Promise(() => {}));
    mockGetAllDivisions.mockReturnValue(new Promise(() => {}));

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

    // Participants are picked from a popup, so nobody is listed until it opens
    expect(screen.queryByText('The Champ (John Cena)')).not.toBeInTheDocument();
    await userEvent.setup().click(
      screen.getByRole('button', { name: /Add participants…/ }),
    );
    expect(screen.getByText('The Champ (John Cena)')).toBeInTheDocument();
    expect(screen.getByText('The Rock (Dwayne Johnson)')).toBeInTheDocument();
    expect(screen.getByText('Undertaker (Mark Calaway)')).toBeInTheDocument();
    expect(screen.getByText('Triple H (Paul Levesque)')).toBeInTheDocument();
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
      expect(screen.getByLabelText('Match Format')).toBeInTheDocument();
    });

    // Select match format (no longer defaults to singles)
    await user.selectOptions(screen.getByLabelText('Match Format'), 'Singles');

    // Pick two players from the popup
    await pickParticipants(user, ['The Champ (John Cena)', 'The Rock (Dwayne Johnson)']);

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
      expect(screen.getByLabelText('Match Format')).toBeInTheDocument();
    });

    // Select match format first (no longer defaults to singles)
    await user.selectOptions(screen.getByLabelText('Match Format'), 'Singles');

    // Select only one participant
    await pickParticipants(user, ['The Champ (John Cena)']);

    // Submit
    await user.click(screen.getByRole('button', { name: 'Schedule Match' }));

    await waitFor(() => {
      expect(screen.getByText('Please select at least 2 participants')).toBeInTheDocument();
    });

    // API should not have been called
    expect(mockScheduleMatch).not.toHaveBeenCalled();
  });

  it('lets the form submit again after a validation error', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    mockScheduleMatch.mockResolvedValue({ matchId: 'new-match' });
    renderScheduleMatch();

    await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Match Format'), 'Singles');
    await pickParticipants(user, ['The Champ (John Cena)']);

    await user.click(screen.getByRole('button', { name: 'Schedule Match' }));
    expect(await screen.findByText('Please select at least 2 participants')).toBeInTheDocument();

    await pickParticipants(user, ['The Rock (Dwayne Johnson)']);
    await user.click(screen.getByRole('button', { name: 'Schedule Match' }));

    await waitFor(() => expect(mockScheduleMatch).toHaveBeenCalledTimes(1));
  });

  it('leaves players with no wrestler out of the picker', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    mockGetAllPlayers.mockResolvedValue([...mockPlayers, hiddenPlayer]);
    renderScheduleMatch();

    await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Match Format'), 'Singles');
    await user.click(screen.getByRole('button', { name: /Add participants/ }));

    expect(screen.getByRole('option', { name: /The Rock/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Newbie/ })).not.toBeInTheDocument();
  });

  describe('discipline', () => {
    const summary = (status: string) => ({
      status,
      activeStrikeCount: 3,
      activeStrikes: [],
      cooldownEndsAt: null,
      signupBlockedUntil: null,
      deactivatedAt: null,
    });
    const deactivatedEntrant = {
      ...mockPlayers[0],
      playerId: 'p9',
      name: 'Gone Guy',
      currentWrestler: 'Sting',
      discipline: summary('deactivated'),
    };

    const openPicker = async (user: ReturnType<typeof userEvent.setup>) => {
      await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
      await user.selectOptions(screen.getByLabelText('Match Format'), 'Singles');
    };

    it('leaves a deactivated player out of the picker', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      mockGetAllPlayers.mockResolvedValue([...mockPlayers, deactivatedEntrant]);
      renderScheduleMatch();

      await openPicker(user);
      await user.click(screen.getByRole('button', { name: /Add participants/ }));

      expect(screen.queryByRole('option', { name: /Sting/ })).not.toBeInTheDocument();
    });

    it('offers a deactivated entrant of the chosen tournament, and warns about the forfeit', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      mockGetAllPlayers.mockResolvedValue([...mockPlayers, deactivatedEntrant]);
      mockGetAllTournaments.mockResolvedValue([{ ...mockTournaments[0], participants: ['p9', 'p1'] }]);
      renderScheduleMatch();

      await openPicker(user);
      await user.selectOptions(screen.getByLabelText(/Tournament/), 't1');
      await pickParticipants(user, ['Sting (Gone Guy)']);

      expect(screen.getByText('discipline.admin.tournamentForfeitWarning')).toBeInTheDocument();
    });

    it('warns about a player blocked from signing up, and still lets staff book them', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      mockGetAllPlayers.mockResolvedValue([
        { ...mockPlayers[0], discipline: summary('signup-blocked') },
        ...mockPlayers.slice(1),
      ]);
      renderScheduleMatch();

      await openPicker(user);
      await pickParticipants(user, ['The Champ (John Cena)']);

      expect(screen.getByText('discipline.admin.bookingWarning')).toBeInTheDocument();
    });

    it('flags the blocked player in the picker and on the chip, not only above the form', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      const blockedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      mockGetAllPlayers.mockResolvedValue([
        {
          ...mockPlayers[0],
          discipline: { ...summary('signup-blocked'), signupBlockedUntil: blockedUntil, cooldownEndsAt: blockedUntil },
        },
        ...mockPlayers.slice(1),
      ]);
      renderScheduleMatch();

      await openPicker(user);
      await user.click(screen.getByRole('button', { name: /Add participants…/ }));

      const option = screen.getByRole('option', { name: /The Champ \(John Cena\)/ });
      expect(within(option).getByText('discipline.status.signupBlocked')).toBeInTheDocument();

      await user.click(option);

      const chip = screen.getByText('The Champ (John Cena)', { selector: '.selected-participant-text' }).closest('li');
      expect(within(chip as HTMLElement).getByText('discipline.status.signupBlocked')).toBeInTheDocument();
    });

    it('leaves a warned player unflagged, since a warning does not affect booking', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      mockGetAllPlayers.mockResolvedValue([
        { ...mockPlayers[0], discipline: { ...summary('warned'), cooldownEndsAt: new Date(Date.now() + 60000).toISOString() } },
        ...mockPlayers.slice(1),
      ]);
      renderScheduleMatch();

      await openPicker(user);
      await pickParticipants(user, ['The Champ (John Cena)']);

      expect(screen.queryByText('discipline.status.warned')).not.toBeInTheDocument();
    });
  });

  it('keeps a hidden player pre-filled from a challenge', async () => {
    setupDefaultMocks();
    mockGetAllPlayers.mockResolvedValue([...mockPlayers, hiddenPlayer]);
    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/admin/schedule',
          state: { fromChallenge: { challengeId: 'ch1', challengerId: 'p1', challengedId: 'p5', matchType: 'Singles' } },
        }]}
      >
        <ScheduleMatch />
      </MemoryRouter>,
    );

    const chip = (await screen.findByRole('button', { name: 'Remove Newbie' })).closest('li')!;
    expect(chip).toHaveTextContent('Newbie');
    expect(chip).not.toHaveTextContent('Hidden');
    expect(chip).not.toHaveTextContent('Needs Wrestler');
  });

  function renderFromChallenge(fromChallenge: Record<string, unknown>) {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/admin/schedule', state: { fromChallenge } }]}>
        <ScheduleMatch />
      </MemoryRouter>,
    );
  }

  it('books a title match from a singles title challenge', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    mockScheduleMatch.mockResolvedValue({});
    renderFromChallenge({ challengeId: 'ch1', challengerId: 'p1', challengedId: 'p2', matchType: 'Singles', championshipId: 'c1' });

    expect(await screen.findByLabelText('Championship Match')).toBeChecked();
    expect(screen.getByLabelText('Championship')).toHaveValue('c1');

    await user.click(screen.getByRole('button', { name: 'Schedule Match' }));

    await waitFor(() => {
      expect(mockScheduleMatch).toHaveBeenCalledWith(expect.objectContaining({
        participants: ['p1', 'p2'],
        isChampionship: true,
        championshipId: 'c1',
        challengeId: 'ch1',
      }));
    });
  });

  it('leaves Championship Match unticked for a challenge with no title', async () => {
    setupDefaultMocks();
    renderFromChallenge({ challengeId: 'ch1', challengerId: 'p1', challengedId: 'p2', matchType: 'Singles' });

    expect(await screen.findByLabelText('Championship Match')).not.toBeChecked();
  });

  it('books both teams and the title from a tag title challenge', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    mockGetAllChampionships.mockResolvedValue([
      { championshipId: 'c2', name: 'Tag Titles', type: 'tag', isActive: true, createdAt: '2024-01-01' },
    ]);
    mockScheduleMatch.mockResolvedValue({});
    const member = (playerId: string) => ({ playerId, playerName: playerId, wrestlerName: playerId });
    renderFromChallenge({
      challengeId: 'ch2',
      challengerId: 'p1',
      challengedId: 'p3',
      matchType: 'Tag Team',
      championshipId: 'c2',
      challengeMode: 'tag_team',
      challengerTagTeam: { tagTeamId: 'tt1', tagTeamName: 'A', player1: member('p1'), player2: member('p2') },
      challengedTagTeam: { tagTeamId: 'tt2', tagTeamName: 'B', player1: member('p3'), player2: member('p4') },
    });

    expect(await screen.findByLabelText('Championship Match')).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Schedule Match' }));

    await waitFor(() => {
      expect(mockScheduleMatch).toHaveBeenCalledWith(expect.objectContaining({
        teams: [['p1', 'p2'], ['p3', 'p4']],
        participants: ['p1', 'p2', 'p3', 'p4'],
        isChampionship: true,
        championshipId: 'c2',
        challengeId: 'ch2',
      }));
    });
  });

  it('falls back to a tag format when a tag challenge names a removed match type', async () => {
    setupDefaultMocks();
    renderFromChallenge({
      challengeId: 'ch3', challengerId: 'p1', challengedId: 'p3', matchType: 'Retired Format', challengeMode: 'tag_team',
    });

    await waitFor(() => expect(screen.getByLabelText('Match Format')).toHaveValue('Tag Team'));
  });

  it('carries the title from a call-out promo', async () => {
    setupDefaultMocks();
    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/admin/schedule',
          state: { fromPromo: { promoId: 'pr1', playerId: 'p1', targetPlayerId: 'p2', championshipId: 'c1' } },
        }]}
      >
        <ScheduleMatch />
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText('Championship Match')).toBeChecked();
    expect(screen.getByLabelText('Championship')).toHaveValue('c1');
  });

  describe('a linked title that no longer exists', () => {
    it('opens a challenge as a non-title match, says so, and can be submitted', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      mockScheduleMatch.mockResolvedValue({});
      renderFromChallenge({
        challengeId: 'ch9', challengerId: 'p1', challengedId: 'p2',
        matchType: mockMatchTypes[0].name, championshipId: 'deleted-title',
      });

      expect(await screen.findByText('Title is gone')).toBeInTheDocument();
      expect(screen.getByLabelText('Championship Match')).not.toBeChecked();
      expect(screen.queryByLabelText('Championship')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Schedule Match' }));

      await waitFor(() => {
        expect(mockScheduleMatch).toHaveBeenCalledWith(expect.objectContaining({
          isChampionship: false,
          challengeId: 'ch9',
        }));
      });
    });

    it('opens a call-out with no challenge the same way', async () => {
      setupDefaultMocks();
      render(
        <MemoryRouter
          initialEntries={[{
            pathname: '/admin/schedule',
            state: { fromPromo: { promoId: 'pr1', playerId: 'p1', targetPlayerId: 'p2', championshipId: 'deleted-title' } },
          }]}
        >
          <ScheduleMatch />
        </MemoryRouter>,
      );

      expect(await screen.findByText('Title is gone')).toBeInTheDocument();
      expect(screen.getByLabelText('Championship Match')).not.toBeChecked();
    });

    it('keeps the title when the list of titles failed to load', async () => {
      setupDefaultMocks();
      mockGetAllChampionships.mockRejectedValue(new Error('burst'));
      renderFromChallenge({
        challengeId: 'ch9', challengerId: 'p1', challengedId: 'p2',
        matchType: mockMatchTypes[0].name, championshipId: 'c1',
      });

      expect(await screen.findByLabelText('Championship Match')).toBeChecked();
      expect(screen.queryByText('Title is gone')).not.toBeInTheDocument();
    });

    it('says nothing when the title exists', async () => {
      setupDefaultMocks();
      renderFromChallenge({
        challengeId: 'ch9', challengerId: 'p1', challengedId: 'p2',
        matchType: mockMatchTypes[0].name, championshipId: 'c1',
      });

      expect(await screen.findByLabelText('Championship Match')).toBeChecked();
      expect(screen.queryByText('Title is gone')).not.toBeInTheDocument();
    });
  });

  describe('booking a tag call-out from the promo row', () => {
    const tagPromo = {
      promoId: 'pr-tag', playerId: 'p1', challengeId: 'ch-tag', challengeMode: 'tag_team',
      createdAt: '2026-01-01T10:00:00.000Z',
    };
    const member = (playerId: string) => ({ playerId, playerName: playerId, wrestlerName: playerId });
    const tagChallenge = {
      challengeId: 'ch-tag', challengerId: 'p1', challengedId: 'p3', matchType: 'Tag Team',
      challengeMode: 'tag_team', createdAt: '2026-01-01T10:00:02.000Z',
      challengerTagTeam: { tagTeamId: 'tt1', tagTeamName: 'A', player1: member('p1'), player2: member('p2') },
      challengedTagTeam: { tagTeamId: 'tt2', tagTeamName: 'B', player1: member('p3'), player2: member('p4') },
    };

    function renderFromTagPromo() {
      render(
        <MemoryRouter initialEntries={[{ pathname: '/admin/schedule', state: { fromPromo: tagPromo } }]}>
          <ScheduleMatch />
        </MemoryRouter>,
      );
    }

    it.each([
      ['accepted', 'an accepted challenge'],
      ['scheduled', 'a challenge whose match was deleted'],
    ])('fills in the teams and links both for status %s (%s)', async (status) => {
      const user = userEvent.setup();
      setupDefaultMocks();
      mockGetChallenges.mockResolvedValue([{ ...tagChallenge, status }]);
      mockScheduleMatch.mockResolvedValue({});
      renderFromTagPromo();

      await waitFor(() => expect(screen.getByLabelText('Match Format')).toHaveValue('Tag Team'));
      await user.click(screen.getByRole('button', { name: 'Schedule Match' }));

      await waitFor(() => {
        expect(mockScheduleMatch).toHaveBeenCalledWith(expect.objectContaining({
          teams: [['p1', 'p2'], ['p3', 'p4']],
          challengeId: 'ch-tag',
          promoId: 'pr-tag',
        }));
      });
    });

    it('leaves the teams to staff when the challenge cannot be read', async () => {
      setupDefaultMocks();
      mockGetChallenges.mockRejectedValue(new Error('offline'));
      renderFromTagPromo();

      await waitFor(() => expect(mockGetChallenges).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByLabelText('Match Format')).toHaveValue(''));
    });
  });

  describe('booking a call-out with a challenge', () => {
    const promo = {
      promoId: 'pr1', playerId: 'p1', targetPlayerId: 'p2', championshipId: 'c1',
      challengeId: 'ch1', createdAt: '2026-01-01T10:00:00.000Z',
    };
    const challenge = {
      challengeId: 'ch1', challengerId: 'p1', challengedId: 'p2', championshipId: 'c1',
      matchType: mockMatchTypes[2].name, stipulation: mockStipulations[0].name,
      status: 'accepted', createdAt: '2026-01-01T10:00:02.000Z',
    };

    function renderFromPromo() {
      render(
        <MemoryRouter initialEntries={[{ pathname: '/admin/schedule', state: { fromPromo: promo } }]}>
          <ScheduleMatch />
        </MemoryRouter>,
      );
    }

    it("carries the challenge's match type and stipulation and links both", async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      mockGetChallenges.mockResolvedValue([challenge]);
      mockScheduleMatch.mockResolvedValue({});
      renderFromPromo();

      await waitFor(() => expect(screen.getByLabelText('Match Format')).toHaveValue(challenge.matchType));
      expect(mockGetChallenges).toHaveBeenCalledWith({ playerId: 'p1' });
      expect(screen.getByLabelText('Stipulation (Optional)')).toHaveValue(mockStipulations[0].stipulationId);

      await user.click(screen.getByRole('button', { name: 'Schedule Match' }));

      await waitFor(() => {
        expect(mockScheduleMatch).toHaveBeenCalledWith(expect.objectContaining({
          matchFormat: challenge.matchType,
          stipulationId: mockStipulations[0].stipulationId,
          challengeId: 'ch1',
          promoId: 'pr1',
        }));
      });
    });

    it('still books from the promo when the challenge cannot be read', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      mockGetChallenges.mockRejectedValue(new Error('offline'));
      mockScheduleMatch.mockResolvedValue({});
      renderFromPromo();

      expect(await screen.findByLabelText('Championship Match')).toBeChecked();
      await user.click(screen.getByRole('button', { name: 'Schedule Match' }));

      await waitFor(() => {
        expect(mockScheduleMatch).toHaveBeenCalledWith(expect.objectContaining({ promoId: 'pr1', championshipId: 'c1' }));
      });
    });

    it.each([
      ['A title match from a challenge must include the current champion. Add them, or book it as a non-title match.', 'scheduleMatch.challengeNeedsChampion'],
      ['This call-out or challenge already has a match booked', 'scheduleMatch.alreadyBooked'],
    ])('translates the refusal: %s', async (apiMessage, key) => {
      const user = userEvent.setup();
      setupDefaultMocks();
      mockGetChallenges.mockResolvedValue([challenge]);
      mockScheduleMatch.mockRejectedValue(new Error(apiMessage));
      renderFromPromo();

      await waitFor(() => expect(screen.getByLabelText('Match Format')).toHaveValue(challenge.matchType));
      await user.click(screen.getByRole('button', { name: 'Schedule Match' }));

      expect(await screen.findByText(key)).toBeInTheDocument();
    });
  });

  it('does not offer a tag team with a hidden member', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    mockGetAllPlayers.mockResolvedValue([...mockPlayers, hiddenPlayer]);
    mockGetAllTagTeams.mockResolvedValue([
      { tagTeamId: 'tt1', name: 'Clean Team', player1Id: 'p1', player2Id: 'p2' },
      { tagTeamId: 'tt2', name: 'Half Hidden', player1Id: 'p1', player2Id: 'p5' },
    ]);
    renderScheduleMatch();

    await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Match Format'), 'Tag Team');

    expect((await screen.findAllByRole('option', { name: /Clean Team/ })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('option', { name: /Half Hidden/ })).not.toBeInTheDocument();
  });

  it('labels a blank-name player instead of leaving empty brackets', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    mockGetAllPlayers.mockResolvedValue([
      ...mockPlayers,
      {
        playerId: 'p5', name: '', currentWrestler: 'Sid Vicious',
        wins: 0, losses: 0, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01',
      },
    ]);
    renderScheduleMatch();

    await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Match Format'), 'Singles');
    await pickParticipants(user, ['Sid Vicious (Unnamed player)']);

    const chip = screen.getByRole('button', { name: 'Remove Unnamed player' }).closest('li')!;
    expect(chip).toHaveTextContent('Sid Vicious (Unnamed player)');
    expect(chip).not.toHaveTextContent('()');
  });

  it('keeps players with no division in the picker by default', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    mockGetAllDivisions.mockResolvedValue([
      { divisionId: 'd1', name: 'Heavyweight', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    ]);
    mockGetAllPlayers.mockResolvedValue([
      { ...mockPlayers[0]!, divisionId: 'd1' },
      {
        playerId: 'p5', name: 'Newbie', currentWrestler: 'Sid Vicious',
        wins: 0, losses: 0, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01',
      },
    ]);
    renderScheduleMatch();

    await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Match Format'), 'Singles');
    await pickParticipants(user, ['Sid Vicious (Newbie)']);

    expect(screen.getByRole('button', { name: 'Remove Newbie' })).toBeInTheDocument();
  });

  describe('when a read fails', () => {
    it('keeps the rest of the form, names the failed source, and retries only that source', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      mockGetAllStipulations.mockRejectedValueOnce(new Error('boom'));
      renderScheduleMatch();

      const notice = await screen.findByRole('alert');
      expect(notice).toHaveTextContent('Stipulations');
      expect(notice).not.toHaveTextContent('Players');
      expect(within(screen.getByLabelText('Match Format')).getByRole('option', { name: 'Singles' })).toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText('Match Format'), 'Singles');
      mockGetAllPlayers.mockClear();
      await user.click(within(notice).getByRole('button', { name: 'Retry' }));

      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(mockGetAllStipulations).toHaveBeenCalledTimes(2);
      expect(mockGetAllPlayers).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Match Format')).toHaveValue('Singles');
    });

    it('holds scheduling until seasons load, so a match cannot silently skip the active season', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      mockGetAllSeasons.mockRejectedValueOnce(new Error('boom'));
      renderScheduleMatch();

      const notice = await screen.findByRole('alert');
      expect(notice).toHaveTextContent('Seasons');
      expect(screen.getByRole('button', { name: 'Schedule Match' })).toBeDisabled();

      await user.click(within(notice).getByRole('button', { name: 'Retry' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Schedule Match' })).toBeEnabled());
    });
  });

  it('picks tag team members with real, keyboard-operable buttons', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    renderScheduleMatch();

    await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Match Format'), 'Tag Team');
    await user.click(screen.getByRole('button', { name: 'Pick Individuals' }));
    expect(screen.getByRole('button', { name: 'Pick Individuals' })).toHaveAttribute('aria-pressed', 'true');

    const [firstCard] = screen.getAllByRole('button', { name: /John Cena/ });
    firstCard!.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: 'Remove John Cena' })).toBeInTheDocument();
    // Now on team 1, so the card in team 2 is unavailable.
    expect(screen.getByRole('button', { name: /John Cena/ , pressed: false })).toBeDisabled();
  });

  // ── Slot-mode (MSL-02) ─────────────────────────────────────────────────────

  it('toggling "Open match for signups" reveals slot rows', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    renderScheduleMatch();

    await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Match Format'), 'Singles');

    expect(screen.queryByLabelText('Open match for signups')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Open match for signups'));

    expect(screen.getByLabelText('Number of spots')).toBeInTheDocument();
    // Default slotsRequired = 2 ⇒ two open-spot booking pickers appear
    expect(screen.getAllByRole('button', { name: /— Open spot —/ })).toHaveLength(2);
  });

  it('submitting in slot mode sends { slots, slotsRequired } not participants', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    mockScheduleMatch.mockResolvedValue({});
    renderScheduleMatch();

    await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Match Format'), 'Singles');
    await user.click(screen.getByLabelText('Open match for signups'));

    // 2 slots; pre-fill the first with John Cena, leave the second open
    const pickers = screen.getAllByRole('button', { name: /— Open spot —/ });
    expect(pickers).toHaveLength(2);
    await user.click(pickers[0]);
    await user.click(screen.getByText('The Champ (John Cena)'));

    await user.click(screen.getByRole('button', { name: 'Schedule Match' }));

    await waitFor(() => expect(mockScheduleMatch).toHaveBeenCalled());
    const callArg = mockScheduleMatch.mock.calls[0][0];
    expect(callArg.slotsRequired).toBe(2);
    expect(Array.isArray(callArg.slots)).toBe(true);
    expect(callArg.slots).toHaveLength(2);
    expect(callArg.slots[0]).toMatchObject({ position: 1, playerId: 'p1' });
    expect(callArg.slots[1]).toMatchObject({ position: 2 });
    expect(callArg.slots[1].playerId).toBeUndefined();
    expect(callArg.participants).toBeUndefined();
  });

  it('legacy participants mode still submits when slot toggle is off', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    mockScheduleMatch.mockResolvedValue({});
    renderScheduleMatch();

    await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Match Format'), 'Singles');

    // Don't toggle slot mode. Pick two participants.
    await pickParticipants(user, ['The Champ (John Cena)', 'The Rock (Dwayne Johnson)']);

    await user.click(screen.getByRole('button', { name: 'Schedule Match' }));

    await waitFor(() => expect(mockScheduleMatch).toHaveBeenCalled());
    const callArg = mockScheduleMatch.mock.calls[0][0];
    expect(callArg.participants).toEqual(['p1', 'p2']);
    expect(callArg.slots).toBeUndefined();
    expect(callArg.slotsRequired).toBeUndefined();
  });

  describe('check-in aware participant picking', () => {
    /** Opens the participants popup without picking anyone. */
    async function openParticipantsPopup(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: /Add participants…/ }));
    }

    it('lists everyone in the popup when no event is selected', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      renderScheduleMatch();

      await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
      await openParticipantsPopup(user);

      expect(screen.getByText('Undertaker (Mark Calaway)')).toBeInTheDocument();
      expect(screen.getByText('Triple H (Paul Levesque)')).toBeInTheDocument();
      expect(mockGetCheckIns).not.toHaveBeenCalled();
    });

    it('filters the popup to available and tentative once an event is picked', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      renderScheduleMatch();

      await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
      await selectEvent(user);
      await waitFor(() => expect(mockGetCheckIns).toHaveBeenCalledWith('e1'));

      await openParticipantsPopup(user);

      expect(screen.getByText('The Champ (John Cena)')).toBeInTheDocument();
      expect(screen.getByText('The Rock (Dwayne Johnson)')).toBeInTheDocument();
      expect(screen.queryByText('Undertaker (Mark Calaway)')).not.toBeInTheDocument();
      expect(screen.queryByText('Triple H (Paul Levesque)')).not.toBeInTheDocument();
    });

    it('groups the popup options under coloured status headings', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      const { container } = renderScheduleMatch();

      await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
      await selectEvent(user);
      await waitFor(() => expect(mockGetCheckIns).toHaveBeenCalledWith('e1'));
      await openParticipantsPopup(user);

      expect(container.querySelector('.booking-picker-group-title--available')).toBeTruthy();
      expect(container.querySelector('.booking-picker-group-title--tentative')).toBeTruthy();
      expect(container.querySelector('.booking-picker-dot--available')).toBeTruthy();
    });

    it('reveals the filtered-out players behind the show-all toggle', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      renderScheduleMatch();

      await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
      await selectEvent(user);
      await waitFor(() => expect(mockGetCheckIns).toHaveBeenCalledWith('e1'));
      await openParticipantsPopup(user);

      await user.click(
        screen.getByRole('button', { name: /Show 2 who didn't check in available/ }),
      );

      expect(screen.getByText('Undertaker (Mark Calaway)')).toBeInTheDocument();
      expect(screen.getByText('Triple H (Paul Levesque)')).toBeInTheDocument();
    });

    it('keeps the popup open across picks and shows a chip per selection', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      renderScheduleMatch();

      await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
      await openParticipantsPopup(user);

      await user.click(screen.getByText('The Champ (John Cena)'));
      // Menu stays open, so the second pick needs no re-open.
      await user.click(screen.getByText('The Rock (Dwayne Johnson)'));

      expect(screen.getByText('Selected: 2')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove John Cena' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove Dwayne Johnson' })).toBeInTheDocument();
    });

    it('removes a participant from its chip', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      renderScheduleMatch();

      await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
      await pickParticipants(user, ['The Champ (John Cena)', 'The Rock (Dwayne Johnson)']);
      await user.keyboard('{Escape}');

      await user.click(screen.getByRole('button', { name: 'Remove John Cena' }));

      expect(screen.getByText('Selected: 1')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Remove John Cena' })).not.toBeInTheDocument();
    });

    it('falls back to the full roster when the check-in fetch fails', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      mockGetCheckIns.mockRejectedValue(new Error('boom'));
      renderScheduleMatch();

      await waitFor(() => expect(screen.getByLabelText('Match Format')).toBeInTheDocument());
      await selectEvent(user);
      await waitFor(() => expect(mockGetCheckIns).toHaveBeenCalled());
      await openParticipantsPopup(user);

      expect(screen.getByText('Undertaker (Mark Calaway)')).toBeInTheDocument();
      expect(screen.getByText('Triple H (Paul Levesque)')).toBeInTheDocument();
    });
  });
});
