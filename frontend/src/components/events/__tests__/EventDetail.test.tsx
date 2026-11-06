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
    getRoster: vi.fn(),
    getPublicPlayers: vi.fn(),
    getBookingSummary: vi.fn(),
    getTagTeams: vi.fn(),
  },
  authState: { isAdminOrModerator: true },
}));

vi.mock('../../../services/api', () => ({
  eventsApi: {
    getById: api.getEvent,
    update: api.updateEvent,
    delete: api.deleteEvent,
    getCheckIns: api.getCheckIns,
  },
  matchesApi: { getAll: api.getScheduled, delete: api.deleteMatch },
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
    isAuthenticated: authState.isAdminOrModerator,
    isWrestler: false,
    playerId: null,
    currentWrestler: null,
    alternateWrestler: null,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }) => {
      if (typeof fallback === 'string') return fallback;
      return fallback?.defaultValue ?? key;
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

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/events/e1']}>
      <Routes>
        <Route path="/events/:eventId" element={<EventDetail />} />
        <Route path="/events" element={<div>Events list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EventDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAdminOrModerator = true;
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
    renderDetail();

    expect(await screen.findByRole('heading', { level: 1, name: 'Summer Slam' })).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Manage event' })).not.toBeInTheDocument();
    expect(api.getRoster).not.toHaveBeenCalled();
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
});
