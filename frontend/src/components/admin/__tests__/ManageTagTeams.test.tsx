import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockTagTeamsApi, mockPlayersApi } = vi.hoisted(() => ({
  mockTagTeamsApi: {
    getAll: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    dissolve: vi.fn(),
    delete: vi.fn(),
  },
  mockPlayersApi: { getAllIncludingHidden: vi.fn() },
}));

const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
vi.mock('../../../services/api/tagTeams.api', () => ({ tagTeamsApi: mockTagTeamsApi }));
vi.mock('../../../services/api', () => ({ playersApi: mockPlayersApi }));

import ManageTagTeams from '../ManageTagTeams';

const baseTeam = {
  wins: 3,
  losses: 1,
  draws: 0,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

const tagTeams = [
  { ...baseTeam, tagTeamId: 't1', name: 'The Usos', player1Id: 'p1', player2Id: 'p2', status: 'pending_admin' },
  { ...baseTeam, tagTeamId: 't2', name: 'New Day', player1Id: 'p1', player2Id: 'p2', status: 'active' },
];

const players = [
  { playerId: 'p1', name: 'Jey', currentWrestler: 'Jey Uso', psnId: 'jey_psn', wins: 0, losses: 0, draws: 0, createdAt: '', updatedAt: '' },
  { playerId: 'p2', name: 'Newbie', currentWrestler: 'Needs Wrestler', wins: 0, losses: 0, draws: 0, createdAt: '', updatedAt: '' },
];

describe('ManageTagTeams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isSuperAdmin: true });
    mockTagTeamsApi.getAll.mockResolvedValue(tagTeams);
    mockPlayersApi.getAllIncludingHidden.mockResolvedValue(players);
  });

  it('hides Delete and Dissolve from Moderators, which the API refuses', async () => {
    mockUseAuth.mockReturnValue({ isSuperAdmin: false });
    render(<ManageTagTeams />);

    await screen.findByText('New Day');
    expect(screen.queryByRole('button', { name: 'Dissolve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('offers Dissolve to Admins', async () => {
    render(<ManageTagTeams />);

    const row = (await screen.findByText('New Day')).closest('tr')!;
    expect(within(row).getByRole('button', { name: 'Dissolve' })).toBeInTheDocument();
  });

  it('says when a team member no longer has a player record', async () => {
    mockPlayersApi.getAllIncludingHidden.mockResolvedValue([]);
    render(<ManageTagTeams />);

    const row = (await screen.findByText('New Day')).closest('tr')!;
    expect(within(row).getAllByText('Former member')).toHaveLength(2);
  });

  it('falls back to the wrestler the team was billed with when the player record is gone', async () => {
    mockPlayersApi.getAllIncludingHidden.mockResolvedValue([]);
    mockTagTeamsApi.getAll.mockResolvedValue([
      { ...tagTeams[1], player1WrestlerName: 'Undertaker', player2WrestlerName: 'Kane' },
    ]);
    render(<ManageTagTeams />);

    const row = (await screen.findByText('New Day')).closest('tr')!;
    expect(within(row).getByText('Undertaker')).toBeInTheDocument();
    expect(within(row).getByText('Kane')).toBeInTheDocument();
    expect(within(row).queryByText('Former member')).not.toBeInTheDocument();
  });

  it('asks before dissolving, and sends nothing if the admin backs out', async () => {
    const user = userEvent.setup();
    mockTagTeamsApi.dissolve.mockResolvedValue(undefined);
    render(<ManageTagTeams />);
    const row = (await screen.findByText('New Day')).closest('tr')!;

    await user.click(within(row).getByRole('button', { name: 'Dissolve' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Dissolve "New Day"? This cannot be undone.');
    expect(mockTagTeamsApi.dissolve).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockTagTeamsApi.dissolve).not.toHaveBeenCalled();

    await user.click(within(row).getByRole('button', { name: 'Dissolve' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Dissolve' }));
    await waitFor(() => expect(mockTagTeamsApi.dissolve).toHaveBeenCalledWith('t2'));
  });

  it('drops the Actions column for a Moderator with nothing to act on', async () => {
    mockUseAuth.mockReturnValue({ isSuperAdmin: false });
    mockTagTeamsApi.getAll.mockResolvedValue([tagTeams[1]]);
    render(<ManageTagTeams />);

    await screen.findByText('New Day');
    expect(screen.queryByRole('columnheader', { name: /actions/i })).not.toBeInTheDocument();
  });

  it('keeps the Actions column for a Moderator with a team to approve', async () => {
    mockUseAuth.mockReturnValue({ isSuperAdmin: false });
    render(<ManageTagTeams />);

    await screen.findByText('The Usos');
    expect(screen.getByRole('columnheader', { name: /actions/i })).toBeInTheDocument();
  });

  it('resolves members from the staff roster, naming hidden players without a tag', async () => {
    render(<ManageTagTeams />);

    const row = (await screen.findByText('The Usos')).closest('tr')!;
    expect(within(row).getByText('Jey Uso / jey_psn')).toBeInTheDocument();
    expect(within(row).getByText('Newbie')).toBeInTheDocument();
    expect(within(row).queryByText('Hidden')).not.toBeInTheDocument();
    expect(within(row).queryByText('Needs Wrestler')).not.toBeInTheDocument();
  });

  it('shows translated status labels rather than raw keys', async () => {
    render(<ManageTagTeams />);

    expect(await screen.findByText('Pending Admin')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('approves a pending team and reloads', async () => {
    const user = userEvent.setup();
    mockTagTeamsApi.approve.mockResolvedValue({});
    render(<ManageTagTeams />);

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() => { expect(mockTagTeamsApi.approve).toHaveBeenCalledWith('t1'); });
    await waitFor(() => { expect(mockTagTeamsApi.getAll).toHaveBeenCalledTimes(2); });
  });

  it('asks before deleting', async () => {
    const user = userEvent.setup();
    mockTagTeamsApi.delete.mockResolvedValue(undefined);
    render(<ManageTagTeams />);

    const row = (await screen.findByText('New Day')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    expect(mockTagTeamsApi.delete).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete "New Day"? This cannot be undone.');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => { expect(mockTagTeamsApi.delete).toHaveBeenCalledWith('t2'); });
  });

  it('shows the error and retries', async () => {
    const user = userEvent.setup();
    mockTagTeamsApi.getAll.mockRejectedValueOnce(new Error('Service down'));
    render(<ManageTagTeams />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Service down');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('The Usos')).toBeInTheDocument();
  });
});
