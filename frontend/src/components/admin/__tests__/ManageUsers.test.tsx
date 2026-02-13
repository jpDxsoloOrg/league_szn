import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockUsersApi, mockPlayersApi, mockDivisionsApi, mockUseAuth } = vi.hoisted(() => ({
  mockUsersApi: { list: vi.fn(), updateRole: vi.fn(), toggleEnabled: vi.fn() },
  mockPlayersApi: { getAll: vi.fn(), update: vi.fn() },
  mockDivisionsApi: { getAll: vi.fn() },
  mockUseAuth: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  usersApi: mockUsersApi,
  playersApi: mockPlayersApi,
  divisionsApi: mockDivisionsApi,
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

import ManageUsers from '../ManageUsers';
import type { Player, Division } from '../../../types';

// --- Test data ---
interface CognitoUser {
  username: string; sub: string; email: string; name: string;
  wrestlerName: string; status: string; enabled: boolean;
  created: string; groups: string[];
}

const mockDivisions: Division[] = [
  { divisionId: 'div-1', name: 'Raw', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { divisionId: 'div-2', name: 'SmackDown', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const mockPlayers: Player[] = [
  {
    playerId: 'pl-1', name: 'John', currentWrestler: 'The Rock',
    wins: 10, losses: 3, draws: 1, userId: 'sub-2', divisionId: 'div-1',
    createdAt: '2024-01-01', updatedAt: '2024-01-01',
  },
];

const mockUsers: CognitoUser[] = [
  {
    username: 'admin-user', sub: 'sub-1', email: 'admin@league.com', name: 'Admin',
    wrestlerName: '', status: 'CONFIRMED', enabled: true,
    created: '2024-01-01T00:00:00Z', groups: ['Admin'],
  },
  {
    username: 'wrestler-user', sub: 'sub-2', email: 'wrestler@league.com', name: 'Wrestler',
    wrestlerName: 'The Rock', status: 'CONFIRMED', enabled: true,
    created: '2024-02-01T00:00:00Z', groups: ['Wrestler'],
  },
  {
    username: 'request-user', sub: 'sub-3', email: 'request@league.com', name: 'Requester',
    wrestlerName: 'Stone Cold', status: 'CONFIRMED', enabled: true,
    created: '2024-03-01T00:00:00Z', groups: [],
  },
  {
    username: 'disabled-user', sub: 'sub-4', email: 'disabled@league.com', name: 'Disabled',
    wrestlerName: '', status: 'CONFIRMED', enabled: false,
    created: '2024-01-15T00:00:00Z', groups: [],
  },
  {
    username: 'mod-user', sub: 'sub-5', email: 'mod@league.com', name: 'Moderator',
    wrestlerName: '', status: 'CONFIRMED', enabled: true,
    created: '2024-01-20T00:00:00Z', groups: ['Moderator'],
  },
];

function setupMocks(overrides: { isSuperAdmin?: boolean } = {}) {
  mockUseAuth.mockReturnValue({ isSuperAdmin: overrides.isSuperAdmin ?? false });
  mockUsersApi.list.mockResolvedValue({ users: mockUsers });
  mockPlayersApi.getAll.mockResolvedValue(mockPlayers);
  mockDivisionsApi.getAll.mockResolvedValue(mockDivisions);
}

function renderComponent() {
  return render(<BrowserRouter><ManageUsers /></BrowserRouter>);
}

describe('ManageUsers', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders user list with role badges after loading', async () => {
    setupMocks();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('User Management')).toBeInTheDocument();
    });

    // All users visible in default "All" tab
    expect(screen.getByText('admin@league.com')).toBeInTheDocument();
    expect(screen.getByText('wrestler@league.com')).toBeInTheDocument();
    expect(screen.getByText('request@league.com')).toBeInTheDocument();
    expect(screen.getByText('disabled@league.com')).toBeInTheDocument();

    // Role badges
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Wrestler')).toBeInTheDocument();
    expect(screen.getByText('Moderator')).toBeInTheDocument();

    // Wrestler request banner (request-user has wrestlerName but no Wrestler group)
    expect(screen.getByText(/1 wrestler request/)).toBeInTheDocument();
  });

  it('filters users by tab selection', async () => {
    const user = userEvent.setup();
    setupMocks();
    renderComponent();
    await waitFor(() => { expect(screen.getByText('admin@league.com')).toBeInTheDocument(); });

    // Wrestler Requests tab
    await user.click(screen.getByRole('button', { name: /Wrestler Requests/i }));
    expect(screen.getByText('request@league.com')).toBeInTheDocument();
    expect(screen.queryByText('admin@league.com')).not.toBeInTheDocument();

    // Wrestlers tab
    await user.click(screen.getByRole('button', { name: /^Wrestlers$/i }));
    expect(screen.getByText('wrestler@league.com')).toBeInTheDocument();
    expect(screen.queryByText('admin@league.com')).not.toBeInTheDocument();

    // Admins tab (includes Moderators)
    await user.click(screen.getByRole('button', { name: /^Admins$/i }));
    expect(screen.getByText('admin@league.com')).toBeInTheDocument();
    expect(screen.getByText('mod@league.com')).toBeInTheDocument();
    expect(screen.queryByText('wrestler@league.com')).not.toBeInTheDocument();

    // Disabled tab
    await user.click(screen.getByRole('button', { name: /Disabled/i }));
    expect(screen.getByText('disabled@league.com')).toBeInTheDocument();
    expect(screen.queryByText('admin@league.com')).not.toBeInTheDocument();
  });

  it('approves wrestler request via promote role action', async () => {
    const user = userEvent.setup();
    setupMocks();
    mockUsersApi.updateRole.mockResolvedValue({
      message: 'Role updated', username: 'request-user', groups: ['Wrestler'],
    });

    renderComponent();
    await waitFor(() => { expect(screen.getByText('request@league.com')).toBeInTheDocument(); });

    // Switch to wrestler requests tab and approve
    await user.click(screen.getByRole('button', { name: /Wrestler Requests/i }));
    await user.click(screen.getByRole('button', { name: 'Approve Wrestler' }));

    await waitFor(() => {
      expect(mockUsersApi.updateRole).toHaveBeenCalledWith('request-user', 'Wrestler', 'promote');
    });
    // After promote to Wrestler, players are re-fetched (auto-creates Player record)
    await waitFor(() => {
      expect(mockPlayersApi.getAll).toHaveBeenCalledTimes(2);
    });
  });

  it('demotes wrestler role', async () => {
    const user = userEvent.setup();
    setupMocks();
    mockUsersApi.updateRole.mockResolvedValue({
      message: 'Role updated', username: 'wrestler-user', groups: [],
    });

    renderComponent();
    await waitFor(() => { expect(screen.getByText('wrestler@league.com')).toBeInTheDocument(); });

    const wrestlerRow = screen.getByText('wrestler@league.com').closest('tr')!;
    await user.click(within(wrestlerRow).getByRole('button', { name: 'Remove Wrestler' }));

    await waitFor(() => {
      expect(mockUsersApi.updateRole).toHaveBeenCalledWith('wrestler-user', 'Wrestler', 'demote');
    });
  });

  it('enables and disables users', async () => {
    const user = userEvent.setup();
    setupMocks();
    mockUsersApi.toggleEnabled.mockResolvedValue({
      message: 'User updated', username: 'wrestler-user', enabled: false,
    });

    renderComponent();
    await waitFor(() => { expect(screen.getByText('wrestler@league.com')).toBeInTheDocument(); });

    const wrestlerRow = screen.getByText('wrestler@league.com').closest('tr')!;
    await user.click(within(wrestlerRow).getByRole('button', { name: 'Disable' }));

    await waitFor(() => {
      expect(mockUsersApi.toggleEnabled).toHaveBeenCalledWith('wrestler-user', false);
    });
  });

  it('assigns division to linked wrestler player', async () => {
    const user = userEvent.setup();
    setupMocks();
    mockPlayersApi.update.mockResolvedValue({ ...mockPlayers[0], divisionId: 'div-2' });

    renderComponent();
    await waitFor(() => { expect(screen.getByText('wrestler@league.com')).toBeInTheDocument(); });

    // wrestler-user (sub-2) is linked to mockPlayers[0] (userId: sub-2)
    const wrestlerRow = screen.getByText('wrestler@league.com').closest('tr')!;
    const divisionSelect = within(wrestlerRow).getByRole('combobox');
    expect(divisionSelect).toHaveValue('div-1');

    await user.selectOptions(divisionSelect, 'div-2');

    await waitFor(() => {
      expect(mockPlayersApi.update).toHaveBeenCalledWith('pl-1', { divisionId: 'div-2' });
    });
  });

  it('shows SuperAdmin-only actions when isSuperAdmin is true', async () => {
    setupMocks({ isSuperAdmin: true });
    renderComponent();
    await waitFor(() => { expect(screen.getByText('admin@league.com')).toBeInTheDocument(); });

    // request-user (no groups) -- should see Make Moderator and Make Admin
    const requestRow = screen.getByText('request@league.com').closest('tr')!;
    expect(within(requestRow).getByRole('button', { name: 'Make Moderator' })).toBeInTheDocument();
    expect(within(requestRow).getByRole('button', { name: 'Make Admin' })).toBeInTheDocument();

    // mod-user -- should see Remove Moderator and Make Admin
    const modRow = screen.getByText('mod@league.com').closest('tr')!;
    expect(within(modRow).getByRole('button', { name: 'Remove Moderator' })).toBeInTheDocument();
    expect(within(modRow).getByRole('button', { name: 'Make Admin' })).toBeInTheDocument();

    // admin-user -- should see Remove Admin
    const adminRow = screen.getByText('admin@league.com').closest('tr')!;
    expect(within(adminRow).getByRole('button', { name: 'Remove Admin' })).toBeInTheDocument();
  });

  it('hides Admin/Moderator management buttons when not SuperAdmin', async () => {
    setupMocks({ isSuperAdmin: false });
    renderComponent();
    await waitFor(() => { expect(screen.getByText('admin@league.com')).toBeInTheDocument(); });

    // Non-SuperAdmin should NOT see admin/moderator management buttons
    expect(screen.queryByRole('button', { name: 'Make Moderator' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make Admin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Admin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Moderator' })).not.toBeInTheDocument();

    // But Wrestler actions and Enable/Disable should still be visible
    expect(screen.getAllByRole('button', { name: 'Disable' }).length).toBeGreaterThan(0);
  });
});
