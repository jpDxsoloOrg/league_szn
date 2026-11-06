import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockFactionsApi } = vi.hoisted(() => ({
  mockFactionsApi: {
    getAll: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    disband: vi.fn(),
    reactivate: vi.fn(),
    delete: vi.fn(),
  },
}));

const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
vi.mock('../../../services/api/factions.api', () => ({ factionsApi: mockFactionsApi }));

import ManageFactions from '../ManageFactions';

const base = { memberIds: ['p1', 'p2'], wins: 1, losses: 2, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' };

const factions = [
  { ...base, stableId: 's1', name: 'The Bloodline', status: 'approved' },
  { ...base, stableId: 's2', name: 'Judgment Day', status: 'disbanded' },
];

describe('ManageFactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isSuperAdmin: true });
    mockFactionsApi.getAll.mockResolvedValue(factions);
  });

  it('labels approved and active as different statuses', async () => {
    render(<ManageFactions />);

    const row = (await screen.findByText('The Bloodline')).closest('tr')!;
    expect(within(row).getByText('Approved')).toBeInTheDocument();
  });

  it('confirms reactivation in the dialog, not the browser', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    mockFactionsApi.reactivate.mockResolvedValue({ restoredMemberIds: ['p1'], skippedMembers: [] });
    render(<ManageFactions />);

    await user.click(await screen.findByRole('button', { name: 'Reactivate' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Members who have since joined another faction will be skipped.');
    await user.click(within(dialog).getByRole('button', { name: 'Reactivate' }));

    await waitFor(() => { expect(mockFactionsApi.reactivate).toHaveBeenCalledWith('s2'); });
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('hides Delete and Disband from Moderators, which the API refuses, and keeps Reactivate', async () => {
    mockUseAuth.mockReturnValue({ isSuperAdmin: false });
    render(<ManageFactions />);

    await screen.findByText('The Bloodline');
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disband' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
  });

  it('offers Disband to Admins', async () => {
    render(<ManageFactions />);

    const row = (await screen.findByText('The Bloodline')).closest('tr')!;
    expect(within(row).getByRole('button', { name: 'Disband' })).toBeInTheDocument();
  });

  it('asks before deleting', async () => {
    const user = userEvent.setup();
    mockFactionsApi.delete.mockResolvedValue(undefined);
    render(<ManageFactions />);

    const row = (await screen.findByText('The Bloodline')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    expect(mockFactionsApi.delete).not.toHaveBeenCalled();

    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => { expect(mockFactionsApi.delete).toHaveBeenCalledWith('s1'); });
  });
});
