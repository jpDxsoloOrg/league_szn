import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getMatches: vi.fn(),
    deleteMatch: vi.fn(),
    getEvents: vi.fn(),
    getPlayers: vi.fn(),
    getTagTeams: vi.fn(),
    getStipulations: vi.fn(),
  },
}));

vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
vi.mock('../../../services/api', () => ({
  matchesApi: { getAll: mocks.getMatches, delete: mocks.deleteMatch },
  eventsApi: { getAll: mocks.getEvents },
  playersApi: { getAllIncludingHidden: mocks.getPlayers },
  tagTeamsApi: { getAll: mocks.getTagTeams },
  stipulationsApi: { getAll: mocks.getStipulations },
}));
vi.mock('../../events/MatchResultForm', () => ({ default: () => <div>result form</div> }));
vi.mock('../../events/MatchEditForm', () => ({ default: () => <div>edit form</div> }));

import StandaloneMatches from '../StandaloneMatches';

const match = {
  matchId: 'm1',
  matchFormat: 'Singles',
  participants: ['p1', 'p2'],
  isChampionship: true,
  championshipId: 'c1',
  status: 'scheduled',
};

const players = [
  { playerId: 'p1', name: 'Jey', currentWrestler: 'Jey Uso' },
  { playerId: 'p2', name: 'Newbie', currentWrestler: 'Needs Wrestler' },
];

function renderPage() {
  return render(<MemoryRouter><StandaloneMatches /></MemoryRouter>);
}

describe('StandaloneMatches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMatches.mockResolvedValue([match]);
    mocks.getEvents.mockResolvedValue([]);
    mocks.getPlayers.mockResolvedValue(players);
    mocks.getTagTeams.mockResolvedValue([]);
    mocks.getStipulations.mockResolvedValue([]);
  });

  it('names players with no wrestler instead of showing Unknown', async () => {
    renderPage();

    expect(await screen.findByText('Jey vs Newbie')).toBeInTheDocument();
    expect(mocks.getPlayers).toHaveBeenCalled();
  });

  it('shows the date so rows can be told apart', async () => {
    mocks.getMatches.mockResolvedValue([{ ...match, date: '2026-03-14T20:00:00.000Z' }]);
    renderPage();

    expect(await screen.findByText(/Mar 14, 2026/)).toBeInTheDocument();
  });

  it('does not claim there are no matches when the match list failed, and retries', async () => {
    const user = userEvent.setup();
    mocks.getMatches.mockRejectedValueOnce(new Error('boom'));
    renderPage();

    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('Matches');
    expect(screen.queryByRole('button', { name: 'Schedule a new match' })).not.toBeInTheDocument();

    await user.click(within(notice).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Jey vs Newbie')).toBeInTheDocument();
  });

  it('keeps the list when only an optional read failed', async () => {
    mocks.getStipulations.mockRejectedValueOnce(new Error('boom'));
    renderPage();

    expect(await screen.findByText('Jey vs Newbie')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Stipulations');
  });

  it('leaves out matches already on an event card', async () => {
    mocks.getEvents.mockResolvedValue([{ eventId: 'e1', matchCards: [{ matchId: 'm1' }] }]);
    renderPage();

    expect(await screen.findByRole('button', { name: 'Schedule a new match' })).toBeInTheDocument();
    expect(screen.queryByText('Jey vs Newbie')).not.toBeInTheDocument();
  });

  it('opens the result form for a match', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Record Result' }));

    expect(screen.getByText('result form')).toBeInTheDocument();
  });

  it('warns about championship matches before deleting', async () => {
    const user = userEvent.setup();
    mocks.deleteMatch.mockResolvedValue(undefined);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete this Singles CHAMPIONSHIP match? This cannot be undone.');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => { expect(mocks.deleteMatch).toHaveBeenCalledWith('m1'); });
  });
});
