import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { api, authState } = vi.hoisted(() => ({
  api: {
    getEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
    getCheckIns: vi.fn(),
    getScheduled: vi.fn(),
    deleteMatch: vi.fn(),
    claimSlot: vi.fn(),
    getRoster: vi.fn(),
    getPublicPlayers: vi.fn(),
    getBookingSummary: vi.fn(),
    getTagTeams: vi.fn(),
  },
  authState: { isAdminOrModerator: true, isAuthenticated: true, isWrestler: false },
}));

vi.mock('../../../services/api', () => ({
  eventsApi: {
    getById: api.getEvent,
    update: api.updateEvent,
    delete: api.deleteEvent,
    getCheckIns: api.getCheckIns,
  },
  matchesApi: { getAll: api.getScheduled, delete: api.deleteMatch, claimSlot: api.claimSlot },
  playersApi: {
    getAll: api.getPublicPlayers,
    getAllIncludingHidden: api.getRoster,
    getBookingSummary: api.getBookingSummary,
  },
  tagTeamsApi: { getAll: api.getTagTeams },
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAdminOrModerator: authState.isAdminOrModerator,
    isAuthenticated: authState.isAuthenticated,
    isWrestler: authState.isWrestler,
    playerId: null,
    currentWrestler: null,
    alternateWrestler: null,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string; match?: string }) => {
      if (typeof fallback === 'string') return fallback;
      return (fallback?.defaultValue ?? key).replace('{{match}}', fallback?.match ?? '');
    },
  }),
}));

vi.mock('../EventCheckInRosterPanel', () => ({ default: () => <div data-testid="roster-panel" /> }));
vi.mock('../MatchEditForm', () => ({ default: () => <div data-testid="match-edit-form" /> }));
vi.mock('../MatchResultForm', () => ({
  default: ({ players }: { players: { name: string }[] }) => (
    <div data-testid="match-result-form">{players.map((player) => player.name).join(', ')}</div>
  ),
}));

import EventDetail from '../EventDetail';
import { ToastContext } from '../../ui/toastContext';

const scheduledMatch = {
  matchId: 'm1',
  date: '2026-08-01',
  matchFormat: 'singles',
  participants: ['p1', 'p2'],
  isChampionship: false,
  status: 'scheduled' as const,
  createdAt: '',
};

const eventWithMatch = {
  eventId: 'e1',
  name: 'Summer Slam',
  eventType: 'ppv',
  date: '2026-08-01',
  venue: 'The Arena',
  status: 'upcoming',
  matchCards: [],
  createdAt: '',
  updatedAt: '',
  enrichedMatches: [{
    position: 1,
    matchId: 'm1',
    designation: 'main-event',
    matchData: {
      matchId: 'm1',
      matchFormat: 'singles',
      participants: [
        { playerId: 'p1', playerName: 'Alice', wrestlerName: 'Alpha' },
        { playerId: 'p2', playerName: 'Bob', wrestlerName: 'Bravo' },
      ],
      isChampionship: false,
      status: 'scheduled',
    },
  }],
};

const showToast = vi.fn();

function renderDetail() {
  return render(
    <ToastContext.Provider value={{ showToast }}>
      <MemoryRouter initialEntries={['/events/e1']}>
        <Routes>
          <Route path="/events/:eventId" element={<EventDetail />} />
          <Route path="/events" element={<div>Events list</div>} />
        </Routes>
      </MemoryRouter>
    </ToastContext.Provider>,
  );
}

type CardRow = [matchId: string, designation: string, notes?: string];

/** An event as the API returns it: enrichedMatches built 1:1 from matchCards. */
function eventWithCard(rows: CardRow[], status = 'upcoming') {
  const matchCards = rows.map(([matchId, designation, notes], index) => ({
    position: index + 1,
    matchId,
    designation,
    ...(notes ? { notes } : {}),
  }));
  return {
    ...eventWithMatch,
    status,
    matchCards,
    enrichedMatches: matchCards.map((card) => ({
      ...card,
      matchData: {
        matchId: card.matchId,
        matchFormat: 'singles',
        participants: [
          { playerId: `${card.matchId}a`, playerName: 'Player', wrestlerName: `${card.matchId} Red` },
          { playerId: `${card.matchId}b`, playerName: 'Player', wrestlerName: `${card.matchId} Blue` },
        ],
        isChampionship: false,
        status: 'scheduled',
      },
    })),
  };
}

const moveUp = (matchId: string) => screen.getByRole('button', { name: `Move ${matchId} Red common.vs ${matchId} Blue up` });
const moveDown = (matchId: string) => screen.getByRole('button', { name: `Move ${matchId} Red common.vs ${matchId} Blue down` });

/** Match ids in the order the page shows them, read from the rendered rows. */
function shownOrder(container: HTMLElement) {
  return [...container.querySelectorAll('.event-match')].map(
    (row) => row.querySelector('.event-match__wrestler')?.textContent?.replace(' Red', ''),
  );
}

describe('EventDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAdminOrModerator = true;
    authState.isAuthenticated = true;
    authState.isWrestler = false;
    api.getEvent.mockResolvedValue(eventWithMatch);
    api.getScheduled.mockResolvedValue([scheduledMatch]);
    api.getRoster.mockResolvedValue([
      { playerId: 'p1', name: 'Alice', currentWrestler: 'Alpha' },
      { playerId: 'hidden', name: 'Hidden Harry', currentWrestler: '' },
    ]);
    api.getTagTeams.mockResolvedValue([]);
    api.getCheckIns.mockResolvedValue(null);
    api.getBookingSummary.mockResolvedValue({});
  });

  it('renders the card for the public without staff controls', async () => {
    authState.isAdminOrModerator = false;
    authState.isAuthenticated = false;
    renderDetail();

    expect(await screen.findByRole('heading', { level: 1, name: 'Summer Slam' })).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Manage event' })).not.toBeInTheDocument();
    expect(api.getRoster).not.toHaveBeenCalled();
  });

  it('still opens when the card points at a deleted match', async () => {
    api.getEvent.mockResolvedValue({
      ...eventWithMatch,
      enrichedMatches: [{ ...eventWithMatch.enrichedMatches[0], matchData: null }],
    });
    renderDetail();

    expect(await screen.findByRole('heading', { level: 1, name: 'Summer Slam' })).toBeInTheDocument();
    expect(await screen.findByText('Match TBA')).toBeInTheDocument();
  });

  const withMatch = (matchFormat: string, participants: string[], teams?: string[][]) => ({
    ...eventWithMatch,
    enrichedMatches: [{
      ...eventWithMatch.enrichedMatches[0],
      matchData: {
        ...eventWithMatch.enrichedMatches[0]?.matchData,
        matchFormat,
        teams,
        participants: participants.map((id) => ({ playerId: id, playerName: `Player ${id}`, wrestlerName: `Wrestler ${id}` })),
      },
    }],
  });

  it('puts one vs between tag team sides and groups the partners', async () => {
    api.getEvent.mockResolvedValue(withMatch('tag-team', ['a', 'b', 'c', 'd'], [['a', 'c'], ['b', 'd']]));
    const { container } = renderDetail();

    await screen.findByText('Wrestler a');
    expect(screen.getAllByText('common.vs')).toHaveLength(1);
    const sides = container.querySelectorAll('.event-match__side');
    expect(sides).toHaveLength(2);
    expect(sides[0]).toHaveTextContent('Wrestler a');
    expect(sides[0]).toHaveTextContent('Wrestler c');
    expect(sides[1]).toHaveTextContent('Wrestler b');
  });

  it('lists a multi-man match without any vs chain', async () => {
    api.getEvent.mockResolvedValue(withMatch('6-pack-challenge', ['a', 'b', 'c', 'd', 'e', 'f']));
    const { container } = renderDetail();

    await screen.findByText('Wrestler a');
    expect(screen.queryByText('common.vs')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.event-match__field > li')).toHaveLength(6);
  });

  it('keeps the poster out from under the title', async () => {
    api.getEvent.mockResolvedValue({ ...eventWithMatch, imageUrl: 'https://example.com/poster.png' });
    const { container } = renderDetail();

    await screen.findByRole('heading', { name: 'Summer Slam' });
    const frame = container.querySelector('.poster-hero__frame');
    expect(frame?.querySelector('img')).toHaveAttribute('src', 'https://example.com/poster.png');
    expect(frame).not.toHaveTextContent('Summer Slam');
  });

  it('gives staff the full roster, including hidden players, when recording a result', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Record Result' }));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(dialog).getByTestId('match-result-form')).toHaveTextContent('Hidden Harry');
    });
    expect(api.getPublicPlayers).not.toHaveBeenCalled();
  });

  it('confirms in a dialog before deleting a match', async () => {
    const user = userEvent.setup();
    api.deleteMatch.mockResolvedValue(undefined);
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(api.deleteMatch).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteMatch).toHaveBeenCalledWith('m1'));
  });

  it('saves date and venue together', async () => {
    const user = userEvent.setup();
    api.updateEvent.mockResolvedValue({ date: '2026-09-02', venue: 'New Hall' });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Edit date and venue' }));
    const dialog = await screen.findByRole('dialog');
    const dateInput = within(dialog).getByLabelText('Event date');
    await user.clear(dateInput);
    await user.type(dateInput, '2026-09-02');
    const venueInput = within(dialog).getByLabelText('Event location');
    await user.clear(venueInput);
    await user.type(venueInput, 'New Hall');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(api.updateEvent).toHaveBeenCalledWith('e1', { date: '2026-09-02', venue: 'New Hall' });
    });
  });

  it('shows a way back when the event cannot be loaded', async () => {
    api.getEvent.mockRejectedValue(new Error('Gone'));
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Gone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'events.detail.backToEvents' })).toBeInTheDocument();
  });

  describe('moving matches on the card', () => {
    const card: CardRow[] = [['m1', 'opener'], ['m2', 'midcard', 'Grudge match'], ['m3', 'main-event']];

    it('swaps the row at once and saves the stored cards in the new order', async () => {
      api.getEvent.mockResolvedValue(eventWithCard(card));
      api.updateEvent.mockResolvedValue({});
      const user = userEvent.setup();
      const { container } = renderDetail();

      await user.click(await waitFor(() => moveUp('m2')));

      expect(shownOrder(container)).toEqual(['m2', 'm1', 'm3']);
      expect(api.updateEvent).toHaveBeenCalledTimes(1);
      expect(api.updateEvent).toHaveBeenCalledWith('e1', {
        matchCards: [
          { position: 1, matchId: 'm2', designation: 'midcard', notes: 'Grudge match' },
          { position: 2, matchId: 'm1', designation: 'opener' },
          { position: 3, matchId: 'm3', designation: 'main-event' },
        ],
      });
    });

    it('keeps the new order when the saved cards are reloaded', async () => {
      api.getEvent.mockResolvedValue(eventWithCard(card));
      api.updateEvent.mockImplementation(async (_eventId: string, { matchCards }: { matchCards: { matchId: string; designation: string }[] }) => {
        api.getEvent.mockResolvedValue(eventWithCard(matchCards.map((entry) => [entry.matchId, entry.designation])));
        return {};
      });
      const user = userEvent.setup();
      const first = renderDetail();

      await user.click(await waitFor(() => moveDown('m1')));
      await waitFor(() => expect(moveDown('m1')).not.toHaveAttribute('aria-disabled'));
      first.unmount();

      const second = renderDetail();
      await waitFor(() => moveDown('m1'));
      expect(shownOrder(second.container)).toEqual(['m2', 'm1', 'm3']);
    });

    it('moves past main card rows stored between two pre-show matches', async () => {
      api.getEvent.mockResolvedValue(eventWithCard([['m1', 'pre-show'], ['m2', 'midcard'], ['m3', 'pre-show'], ['m4', 'main-event']]));
      api.updateEvent.mockResolvedValue({});
      const user = userEvent.setup();
      const { container } = renderDetail();

      await user.click(await waitFor(() => moveUp('m3')));

      expect(shownOrder(container)).toEqual(['m3', 'm1', 'm2', 'm4']);
      const saved = api.updateEvent.mock.calls[0]?.[1].matchCards;
      expect(saved.map((entry: { matchId: string }) => entry.matchId)).toEqual(['m3', 'm2', 'm1', 'm4']);
      expect(saved.map((entry: { position: number }) => entry.position)).toEqual([1, 2, 3, 4]);
    });

    it('disables the outward control at each end of a section', async () => {
      api.getEvent.mockResolvedValue(eventWithCard([['m1', 'pre-show'], ['m2', 'pre-show'], ['m3', 'opener'], ['m4', 'midcard'], ['m5', 'main-event']]));
      renderDetail();
      await waitFor(() => moveUp('m1'));

      expect(moveUp('m1')).toBeDisabled();
      expect(moveDown('m1')).toBeEnabled();
      expect(moveDown('m2')).toBeDisabled();
      expect(moveUp('m3')).toBeDisabled();
      expect(moveUp('m4')).toBeEnabled();
      expect(moveDown('m4')).toBeEnabled();
      expect(moveDown('m5')).toBeDisabled();
    });

    it('locks the controls and match actions while saving, and ignores a second click', async () => {
      api.getEvent.mockResolvedValue(eventWithCard(card));
      let finishSave = () => {};
      api.updateEvent.mockImplementation(() => new Promise<void>((resolve) => { finishSave = resolve; }));
      const user = userEvent.setup();
      renderDetail();

      await user.click(await waitFor(() => moveUp('m2')));

      expect(moveUp('m3')).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getAllByRole('button', { name: 'Delete' })[0]).toBeDisabled();
      await user.click(moveUp('m3'));
      expect(api.updateEvent).toHaveBeenCalledTimes(1);

      finishSave();
      await waitFor(() => expect(moveUp('m3')).not.toHaveAttribute('aria-disabled'));
    });

    it('rolls the card back and shows an error toast when the save fails', async () => {
      api.getEvent.mockResolvedValue(eventWithCard(card));
      api.updateEvent.mockRejectedValue(new Error('Server error'));
      const user = userEvent.setup();
      const { container } = renderDetail();

      await user.click(await waitFor(() => moveDown('m1')));

      await waitFor(() => expect(showToast).toHaveBeenCalledWith('Could not save the new match order.', 'error'));
      expect(shownOrder(container)).toEqual(['m1', 'm2', 'm3']);
      expect(moveDown('m1')).toHaveFocus();
      expect(moveDown('m1')).not.toHaveAttribute('aria-disabled');

      api.updateEvent.mockResolvedValue({});
      await user.click(moveDown('m1'));
      expect(api.updateEvent.mock.calls[1]?.[1].matchCards.map((entry: { position: number }) => entry.position)).toEqual([1, 2, 3]);
    });

    it('keeps focus on the control used, or its partner at the end of a section', async () => {
      api.getEvent.mockResolvedValue(eventWithCard(card));
      api.updateEvent.mockResolvedValue({});
      const user = userEvent.setup();
      renderDetail();

      await user.click(await waitFor(() => moveDown('m1')));
      expect(moveDown('m1')).toHaveFocus();

      await user.click(moveDown('m1'));
      expect(moveDown('m1')).toBeDisabled();
      expect(moveUp('m1')).toHaveFocus();
    });

    /** The card with an open spot on m3, so Claim can trigger an event read mid-save. */
    function cardWithOpenSlot(rows: CardRow[]) {
      const event = eventWithCard(rows);
      return {
        ...event,
        enrichedMatches: event.enrichedMatches.map((entry) => (entry.matchId === 'm3'
          ? { ...entry, matchData: { ...entry.matchData, status: 'open-signups', slots: [{ slotId: 's1', position: 1 }] } }
          : entry)),
      };
    }
    const movedCard: CardRow[] = [['m2', 'midcard'], ['m1', 'opener'], ['m3', 'main-event']];

    it('holds an event read back until the save finishes', async () => {
      api.getEvent.mockResolvedValue(cardWithOpenSlot(card));
      api.claimSlot.mockResolvedValue(undefined);
      let finishSave = () => {};
      api.updateEvent.mockImplementation(() => new Promise<void>((resolve) => { finishSave = resolve; }));
      const user = userEvent.setup();
      const { container } = renderDetail();

      await user.click(await waitFor(() => moveUp('m2')));
      const readsBeforeClaim = api.getEvent.mock.calls.length;
      await user.click(screen.getByRole('button', { name: 'Claim spot' }));
      await waitFor(() => expect(api.claimSlot).toHaveBeenCalled());

      expect(api.getEvent).toHaveBeenCalledTimes(readsBeforeClaim);
      expect(shownOrder(container)).toEqual(['m2', 'm1', 'm3']);

      api.getEvent.mockResolvedValue(cardWithOpenSlot(movedCard));
      finishSave();
      await waitFor(() => expect(api.getEvent).toHaveBeenCalledTimes(readsBeforeClaim + 1));
      expect(shownOrder(container)).toEqual(['m2', 'm1', 'm3']);
    });

    it('discards a read that started before the save and reads again', async () => {
      api.getEvent.mockResolvedValue(cardWithOpenSlot(card));
      api.claimSlot.mockResolvedValue(undefined);
      api.updateEvent.mockResolvedValue({});
      const user = userEvent.setup();
      const { container } = renderDetail();
      const moveControl = await waitFor(() => moveUp('m2'));

      let finishRead = (_event: unknown) => {};
      api.getEvent.mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve; }));
      await user.click(screen.getByRole('button', { name: 'Claim spot' }));
      await waitFor(() => expect(api.claimSlot).toHaveBeenCalled());
      await user.click(moveControl);

      api.getEvent.mockResolvedValue(cardWithOpenSlot(movedCard));
      const readsBeforeFinish = api.getEvent.mock.calls.length;
      finishRead(cardWithOpenSlot(card));

      await waitFor(() => expect(api.getEvent.mock.calls.length).toBeGreaterThan(readsBeforeFinish));
      await waitFor(() => expect(moveUp('m3')).not.toHaveAttribute('aria-disabled'));
      expect(shownOrder(container)).toEqual(['m2', 'm1', 'm3']);
    });

    it.each(['completed', 'cancelled'])('shows no controls on a %s event', async (status) => {
      api.getEvent.mockResolvedValue(eventWithCard(card, status));
      renderDetail();

      await screen.findByText('m1 Red');
      expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument();
    });

    it('offers the controls on an event in progress', async () => {
      api.getEvent.mockResolvedValue(eventWithCard(card, 'in-progress'));
      renderDetail();

      await waitFor(() => expect(moveUp('m2')).toBeEnabled());
    });

    it.each([
      ['a guest', { isAdminOrModerator: false, isAuthenticated: false, isWrestler: false }],
      ['a wrestler', { isAdminOrModerator: false, isAuthenticated: true, isWrestler: true }],
    ])('shows no controls to %s', async (_role, role) => {
      Object.assign(authState, role);
      api.getEvent.mockResolvedValue(eventWithCard(card));
      renderDetail();

      await screen.findByText('m1 Red');
      expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument();
    });
  });
});
