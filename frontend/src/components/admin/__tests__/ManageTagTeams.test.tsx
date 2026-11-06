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
    mockTagTeamsApi.getAll.mockResolvedValue(tagTeams);
    mockPlayersApi.getAllIncludingHidden.mockResolvedValue(players);
  });

  it('resolves members from the staff roster and badges hidden players', async () => {
    render(<ManageTagTeams />);

    const row = (await screen.findByText('The Usos')).closest('tr')!;
    expect(within(row).getByText('Jey Uso / jey_psn')).toBeInTheDocument();
    expect(within(row).getByText('Newbie')).toBeInTheDocument();
    expect(within(row).getByText('Hidden')).toBeInTheDocument();
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
