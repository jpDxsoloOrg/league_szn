import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// INJ-11: the injuries feature is off unless a test turns it on.
const { siteFeatures } = vi.hoisted(() => ({ siteFeatures: { injuries: false } }));
vi.mock('../../../contexts/SiteConfigContext', () => ({
  useSiteConfig: () => ({ features: siteFeatures, isLoading: false }),
}));

vi.mock('../../../services/api', () => ({
  matchesApi: {
    getAll: mockGetAllMatches,
    update: mockUpdateMatch,
  },
  playersApi: { getAllIncludingHidden: mockGetAllPlayers },
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
    i18n: { language: 'en' },
    t: (key: string, fallback?: string | { defaultValue?: string }) =>
      (typeof fallback === 'string' ? fallback : fallback?.defaultValue) ?? key,
  }),
}));

vi.mock('../MatchEditForm.css', () => ({}));
vi.mock('../../admin/SearchableSelect.css', () => ({}));

import MatchEditForm from '../MatchEditForm';
import { ApiError } from '../../../services/api/apiClient';

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

  const hiddenPlayer = {
    playerId: 'p9', name: 'Newbie', currentWrestler: 'Needs Wrestler',
    wins: 0, losses: 0, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01',
  };

  it('leaves a hidden player who is not on this match out of the list', async () => {
    setupDefaultMocks();
    mockGetAllPlayers.mockResolvedValue([...mockPlayers, hiddenPlayer]);

    render(<MatchEditForm matchId="m1" onSuccess={vi.fn()} onCancel={vi.fn()} />);

    await screen.findByText('Undertaker', { selector: '.match-edit-form__player-name' });
    expect(screen.queryByText('Newbie')).not.toBeInTheDocument();
  });

  it('keeps a hidden player already booked on this match, without tagging them', async () => {
    setupDefaultMocks();
    mockGetAllPlayers.mockResolvedValue([...mockPlayers, hiddenPlayer]);
    mockGetAllMatches.mockResolvedValue([{ ...scheduledMatch, participants: ['p1', 'p9'] }]);

    render(<MatchEditForm matchId="m1" onSuccess={vi.fn()} onCancel={vi.fn()} />);

    const row = (await screen.findByText('Newbie')).closest('button')!;
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(row).not.toHaveTextContent('Hidden');
    expect(row).not.toHaveTextContent('Needs Wrestler');
  });

  it('saves a booked hidden player back onto the match', async () => {
    setupDefaultMocks();
    mockGetAllPlayers.mockResolvedValue([...mockPlayers, hiddenPlayer]);
    mockGetAllMatches.mockResolvedValue([{ ...scheduledMatch, participants: ['p1', 'p9'] }]);
    mockUpdateMatch.mockResolvedValue({});

    render(<MatchEditForm matchId="m1" onSuccess={vi.fn()} onCancel={vi.fn()} />);

    await screen.findByText('Newbie');
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(mockUpdateMatch).toHaveBeenCalledTimes(1));
    expect(mockUpdateMatch.mock.calls[0]![1]).toMatchObject({ participants: ['p1', 'p9'] });
  });

  describe('team names on each side of a tag match', () => {
    const usos = { tagTeamId: 'tt-usos', name: 'The Usos', player1Id: 'p1', player2Id: 'p2' };
    const tagMatch = {
      ...scheduledMatch,
      matchFormat: 'tag team',
      participants: ['p1', 'p2', 'p3', 'p9'],
      teams: [['p2', 'p1'], ['p3', 'p9']],
    };

    it('bills a booked pair by its team name and leaves an unregistered pair as "Team 2"', async () => {
      setupDefaultMocks();
      mockGetAllPlayers.mockResolvedValue([...mockPlayers, hiddenPlayer]);
      mockGetAllMatches.mockResolvedValue([tagMatch]);
      mockGetAllTagTeams.mockResolvedValue([usos]);

      render(<MatchEditForm matchId="m1" onSuccess={vi.fn()} onCancel={vi.fn()} />);

      expect(await screen.findByRole('heading', { name: /^Team 1: The Usos/ })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /^Team 2\b/ })).not.toHaveTextContent('The Usos');
    });

    it('updates the side name when the GM picks a team from the list', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();
      mockGetAllMatches.mockResolvedValue([{ ...tagMatch, teams: [['p1', 'p3'], ['p2']] }]);
      mockGetAllTagTeams.mockResolvedValue([usos]);

      render(<MatchEditForm matchId="m1" onSuccess={vi.fn()} onCancel={vi.fn()} />);

      const picker = await screen.findByLabelText('Team 2: Select a Tag Team...');
      expect(screen.queryByRole('heading', { name: /The Usos/ })).not.toBeInTheDocument();
      await user.selectOptions(picker, 'tt-usos');

      expect(screen.getByRole('heading', { name: /^Team 2: The Usos/ })).toBeInTheDocument();
    });

    it('shows a team with a hidden member as unavailable instead of dropping it', async () => {
      setupDefaultMocks();
      mockGetAllPlayers.mockResolvedValue([...mockPlayers, hiddenPlayer]);
      mockGetAllMatches.mockResolvedValue([{ ...tagMatch, participants: ['p1', 'p2', 'p3'], teams: [['p1', 'p2'], ['p3']] }]);
      mockGetAllTagTeams.mockResolvedValue([
        { tagTeamId: 'tt-half', name: 'Half Hidden', player1Id: 'p3', player2Id: 'p9' },
      ]);

      render(<MatchEditForm matchId="m1" onSuccess={vi.fn()} onCancel={vi.fn()} />);

      const [option] = await screen.findAllByRole('option', { name: /Half Hidden/ });
      expect(option).toBeDisabled();
      expect(option).toHaveTextContent('(1 member unavailable)');
    });
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

  it('selects the match type a differently spelled stored format belongs to, and saves without re-picking anyone', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    mockGetAllMatchTypes.mockResolvedValue([
      { matchTypeId: 'mt1', name: 'Single', createdAt: '', updatedAt: '' },
      { matchTypeId: 'mt2', name: 'Tag Team', createdAt: '', updatedAt: '' },
    ]);
    mockUpdateMatch.mockResolvedValue({ ...scheduledMatch });
    const onSuccess = vi.fn();

    render(<MatchEditForm matchId="m1" onSuccess={onSuccess} onCancel={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Match Format')).toHaveValue('Single'));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const [, payload] = mockUpdateMatch.mock.calls[0];
    expect(payload.matchFormat).toBe('Single');
    expect(payload.participants).toEqual(['p1', 'p2']);
  });

  it('prefers the exact match type when two are spelled alike', async () => {
    setupDefaultMocks();
    mockGetAllMatchTypes.mockResolvedValue([
      { matchTypeId: 'mt1', name: 'Single', createdAt: '', updatedAt: '' },
      { matchTypeId: 'mt2', name: 'singles', createdAt: '', updatedAt: '' },
    ]);

    render(<MatchEditForm matchId="m1" onSuccess={vi.fn()} onCancel={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Match Format')).toHaveValue('singles'));
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

// INJ-11
describe('MatchEditForm injury override', () => {
  const returnsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const injuredUndertaker = {
    ...mockPlayers[2]!,
    currentInjury: { startedAt: '2024-01-01', returnsAt, severity: 'moderate', weeks: 2 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    siteFeatures.injuries = true;
    setupDefaultMocks();
    mockGetAllPlayers.mockResolvedValue([mockPlayers[0], mockPlayers[1], injuredUndertaker]);
  });

  afterEach(() => {
    siteFeatures.injuries = false;
  });

  const undertakerButton = async () =>
    (await screen.findByText('Undertaker', { selector: '.match-edit-form__player-name' })).closest('button')!;

  it('tags an injured player and keeps them disabled until the override is ticked', async () => {
    render(<MatchEditForm matchId="m1" onSuccess={vi.fn()} onCancel={vi.fn()} />);

    const button = await undertakerButton();
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('injuryReport.booking.injuredUntil');

    await userEvent.click(screen.getByRole('checkbox', { name: /injuryReport.booking.allowInjured/ }));
    expect(button).toBeEnabled();
  });

  it('sends allowInjured and shows the warnings the save returns', async () => {
    const onSuccess = vi.fn();
    mockUpdateMatch.mockResolvedValue({
      injuryWarnings: [{ code: 'PLAYER_INJURED', playerId: 'p3', name: 'Undertaker', returnsAt, message: '' }],
    });
    render(<MatchEditForm matchId="m1" onSuccess={onSuccess} onCancel={vi.fn()} />);

    await userEvent.click(await screen.findByRole('checkbox', { name: /injuryReport.booking.allowInjured/ }));
    await userEvent.click(await undertakerButton());
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(mockUpdateMatch).toHaveBeenCalledTimes(1));
    expect(mockUpdateMatch.mock.calls[0]![1]).toMatchObject({ participants: ['p1', 'p2', 'p3'], allowInjured: true });
    expect(await screen.findByText('injuryReport.booking.warningLine')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'injuryReport.booking.done' }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows the injury refusal when the save is refused', async () => {
    mockUpdateMatch.mockRejectedValue(new ApiError('Undertaker is injured', 409, {
      code: 'PLAYER_INJURED',
      body: { code: 'PLAYER_INJURED', playerId: 'p3', returnsAt },
    }));
    render(<MatchEditForm matchId="m1" onSuccess={vi.fn()} onCancel={vi.fn()} />);

    await screen.findByText('Undertaker', { selector: '.match-edit-form__player-name' });
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('injuryReport.booking.refused');
  });

  it('leaves the pickers alone while the injuries feature is off', async () => {
    siteFeatures.injuries = false;
    render(<MatchEditForm matchId="m1" onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(await undertakerButton()).toBeEnabled();
    expect(screen.queryByRole('checkbox', { name: /injuryReport.booking.allowInjured/ })).not.toBeInTheDocument();
  });
});
