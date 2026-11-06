import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const { mockChallengesApi } = vi.hoisted(() => ({
  mockChallengesApi: { getAll: vi.fn(), cancel: vi.fn(), delete: vi.fn(), bulkDelete: vi.fn() },
}));

const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
vi.mock('../../../services/api/challenges.api', () => ({ challengesApi: mockChallengesApi }));
vi.mock('../../ui/toastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

import AdminChallenges from '../AdminChallenges';

const openCallOut = {
  challengeId: 'c1',
  challengerId: 'p1',
  challengedId: 'p2',
  matchType: 'singles',
  status: 'pending',
  expiresAt: '2030-01-01',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  challenger: { playerName: 'Adam', wrestlerName: 'Edge' },
  challenged: { playerName: 'Bea', wrestlerName: 'Lita' },
};

function renderPage() {
  return render(<MemoryRouter><AdminChallenges /></MemoryRouter>);
}

describe('AdminChallenges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChallengesApi.getAll.mockResolvedValue([openCallOut]);
  });

  it('hands the title and both teams to Schedule Match', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ isSuperAdmin: true });
    const team = (tagTeamId: string) => ({
      tagTeamId,
      tagTeamName: tagTeamId,
      player1: { playerId: `${tagTeamId}-a`, playerName: 'A', wrestlerName: 'A' },
      player2: { playerId: `${tagTeamId}-b`, playerName: 'B', wrestlerName: 'B' },
    });
    mockChallengesApi.getAll.mockResolvedValue([{
      ...openCallOut,
      status: 'accepted',
      challengeMode: 'tag_team',
      championshipId: 'tag-belts',
      challengerTagTeam: team('one'),
      challengedTagTeam: team('two'),
    }]);
    let fromChallenge: Record<string, unknown> | undefined;
    function ScheduleProbe() {
      fromChallenge = (useLocation().state as { fromChallenge?: Record<string, unknown> }).fromChallenge;
      return null;
    }
    render(
      <MemoryRouter initialEntries={['/admin/promos']}>
        <Routes>
          <Route path="/admin/promos" element={<AdminChallenges />} />
          <Route path="/admin/schedule" element={<ScheduleProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Schedule' }));

    expect(fromChallenge).toMatchObject({
      championshipId: 'tag-belts',
      challengeMode: 'tag_team',
      challengerTagTeam: team('one'),
      challengedTagTeam: team('two'),
    });
  });

  it('offers Expire on an open call-out to Admins', async () => {
    mockUseAuth.mockReturnValue({ isSuperAdmin: true });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Expire' })).toBeInTheDocument();
  });

  it('asks before expiring, and sends nothing if the admin backs out', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ isSuperAdmin: true });
    mockChallengesApi.getAll.mockResolvedValue([openCallOut]);
    mockChallengesApi.cancel.mockResolvedValue(undefined);
    render(<MemoryRouter><AdminChallenges /></MemoryRouter>);

    await user.click(await screen.findByRole('button', { name: 'Expire' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('This cannot be undone.');
    expect(mockChallengesApi.cancel).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockChallengesApi.cancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Expire' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Expire' }));
    await waitFor(() => expect(mockChallengesApi.cancel).toHaveBeenCalledWith('c1'));
  });

  it('hides Expire from Moderators, which the API refuses', async () => {
    mockUseAuth.mockReturnValue({ isSuperAdmin: false });
    renderPage();

    await screen.findByRole('link', { name: 'View Details' });
    expect(screen.queryByRole('button', { name: 'Expire' })).not.toBeInTheDocument();
  });
});
