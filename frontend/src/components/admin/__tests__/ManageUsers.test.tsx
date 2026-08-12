import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockUsersApi, mockPlayersApi, mockDivisionsApi, mockWrestlersApi, mockUseAuth } = vi.hoisted(() => ({
  mockUsersApi: { list: vi.fn(), updateRole: vi.fn(), toggleEnabled: vi.fn() },
  mockPlayersApi: { getAll: vi.fn(), update: vi.fn() },
  mockDivisionsApi: { getAll: vi.fn() },
  mockWrestlersApi: { getAll: vi.fn() },
  mockUseAuth: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  usersApi: mockUsersApi,
  playersApi: mockPlayersApi,
  divisionsApi: mockDivisionsApi,
  wrestlersApi: mockWrestlersApi,
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

import ManageUsers from '../ManageUsers';
import type { Division, Wrestler } from '../../../types';

// --- Test data ---
interface LinkedPlayer {
  playerId: string; divisionId: string; currentWrestler: string; currentWrestlerId: string;
}

interface CognitoUser {
  username: string; sub: string; email: string; name: string;
  wrestlerName: string; status: string; enabled: boolean;
  created: string; groups: string[]; player: LinkedPlayer | null;
}

const mockDivisions: Division[] = [
  { divisionId: 'div-1', name: 'Raw', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { divisionId: 'div-2', name: 'SmackDown', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const mockWrestlers: Wrestler[] = [
  {
    wrestlerId: 'w-rock', promotion: 'WWE', name: 'The Rock', overallCap: 95,
    isInUse: true, assignedPlayerId: 'pl-1', assignedSlot: 'primary',
    createdAt: '2024-01-01', updatedAt: '2024-01-01',
  },
  {
    wrestlerId: 'w-austin', promotion: 'WWE', name: 'Stone Cold', overallCap: 94,
    isInUse: false, createdAt: '2024-01-01', updatedAt: '2024-01-01',
  },
  {
    wrestlerId: 'w-omega', promotion: 'AEW', name: 'Kenny Omega', overallCap: 93,
    isInUse: false, createdAt: '2024-01-01', updatedAt: '2024-01-01',
  },
];

const mockUsers: CognitoUser[] = [
  {
    username: 'admin-user', sub: 'sub-1', email: 'admin@league.com', name: 'Admin',
    wrestlerName: '', status: 'CONFIRMED', enabled: true,
    created: '2024-01-01T00:00:00Z', groups: ['Admin'], player: null,
  },
  {
    username: 'wrestler-user', sub: 'sub-2', email: 'wrestler@league.com', name: 'Wrestler',
    wrestlerName: 'The Rock', status: 'CONFIRMED', enabled: true,
    created: '2024-02-01T00:00:00Z', groups: ['Wrestler'],
    player: { playerId: 'pl-1', divisionId: 'div-1', currentWrestler: 'The Rock', currentWrestlerId: 'w-rock' },
  },
  {
    username: 'request-user', sub: 'sub-3', email: 'request@league.com', name: 'Requester',
    wrestlerName: 'Stone Cold', status: 'CONFIRMED', enabled: true,
    created: '2024-03-01T00:00:00Z', groups: [], player: null,
  },
  {
    username: 'disabled-user', sub: 'sub-4', email: 'disabled@league.com', name: 'Disabled',
    wrestlerName: '', status: 'CONFIRMED', enabled: false,
    created: '2024-01-15T00:00:00Z', groups: [], player: null,
  },
  {
    username: 'mod-user', sub: 'sub-5', email: 'mod@league.com', name: 'Moderator',
    wrestlerName: '', status: 'CONFIRMED', enabled: true,
    created: '2024-01-20T00:00:00Z', groups: ['Moderator'], player: null,
  },
  // Regression case: approved Wrestler whose auto-created Player has no
  // wrestler assigned yet. `GET /players` hides these, so the admin used to
  // get "-" in the Division column with no way to slot them.
  {
    username: 'no-wrestler-user', sub: 'sub-6', email: 'nowrestler@league.com', name: 'No Wrestler',
    wrestlerName: '', status: 'CONFIRMED', enabled: true,
    created: '2024-04-01T00:00:00Z', groups: ['Wrestler'],
    player: { playerId: 'pl-2', divisionId: '', currentWrestler: '', currentWrestlerId: '' },
  },
];

function setupMocks(overrides: { isSuperAdmin?: boolean } = {}) {
  mockUseAuth.mockReturnValue({ isSuperAdmin: overrides.isSuperAdmin ?? false });
  mockUsersApi.list.mockResolvedValue({ users: mockUsers });
  mockDivisionsApi.getAll.mockResolvedValue(mockDivisions);
  mockWrestlersApi.getAll.mockResolvedValue(mockWrestlers);
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
    expect(screen.getAllByText('Wrestler').length).toBeGreaterThan(0);
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
    // After promote to Wrestler, users are re-fetched so the newly
    // auto-created Player link (and its division slot) appears.
    await waitFor(() => {
      expect(mockUsersApi.list).toHaveBeenCalledTimes(2);
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
    mockPlayersApi.update.mockResolvedValue({ playerId: 'pl-1', divisionId: 'div-2' });

    renderComponent();
    await waitFor(() => { expect(screen.getByText('wrestler@league.com')).toBeInTheDocument(); });

    const wrestlerRow = screen.getByText('wrestler@league.com').closest('tr')!;
    const divisionSelect = within(wrestlerRow).getByLabelText('Division for wrestler@league.com');
    expect(divisionSelect).toHaveValue('div-1');

    await user.selectOptions(divisionSelect, 'div-2');

    await waitFor(() => {
      expect(mockPlayersApi.update).toHaveBeenCalledWith('pl-1', { divisionId: 'div-2' });
    });
    await waitFor(() => { expect(divisionSelect).toHaveValue('div-2'); });
  });

  it('offers a division slot to a Wrestler whose player has no wrestler assigned', async () => {
    const user = userEvent.setup();
    setupMocks();
    mockPlayersApi.update.mockResolvedValue({ playerId: 'pl-2', divisionId: 'div-1' });

    renderComponent();
    await waitFor(() => { expect(screen.getByText('nowrestler@league.com')).toBeInTheDocument(); });

    const row = screen.getByText('nowrestler@league.com').closest('tr')!;
    const divisionSelect = within(row).getByLabelText('Division for nowrestler@league.com');
    expect(divisionSelect).toHaveValue('');

    await user.selectOptions(divisionSelect, 'div-1');

    await waitFor(() => {
      expect(mockPlayersApi.update).toHaveBeenCalledWith('pl-2', { divisionId: 'div-1' });
    });
  });

  it('assigns a wrestler to a linked player with no wrestler yet', async () => {
    const user = userEvent.setup();
    setupMocks();
    mockPlayersApi.update.mockResolvedValue({
      playerId: 'pl-2', currentWrestlerId: 'w-austin', currentWrestler: 'Stone Cold',
    });

    renderComponent();
    await waitFor(() => { expect(screen.getByText('nowrestler@league.com')).toBeInTheDocument(); });

    const select = screen.getByLabelText('Assigned wrestler for nowrestler@league.com');
    expect(select).toHaveValue('');

    // The in-use wrestler is hidden; free ones are offered.
    expect(within(select).queryByRole('option', { name: 'The Rock' })).not.toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Stone Cold' })).toBeInTheDocument();

    await user.selectOptions(select, 'w-austin');

    await waitFor(() => {
      expect(mockPlayersApi.update).toHaveBeenCalledWith('pl-2', { currentWrestlerId: 'w-austin' });
    });
    // Roster is re-read so the now-used wrestler leaves the other dropdowns.
    await waitFor(() => { expect(mockWrestlersApi.getAll).toHaveBeenCalledTimes(2); });
    await waitFor(() => { expect(select).toHaveValue('w-austin'); });
  });

  it('keeps the current pick selectable even though it is in use', async () => {
    setupMocks();
    renderComponent();
    await waitFor(() => { expect(screen.getByText('wrestler@league.com')).toBeInTheDocument(); });

    const select = screen.getByLabelText('Assigned wrestler for wrestler@league.com');
    expect(select).toHaveValue('w-rock');
    expect(within(select).getByRole('option', { name: 'The Rock' })).toBeInTheDocument();
  });

  it('surfaces an error when wrestler assignment fails', async () => {
    const user = userEvent.setup();
    setupMocks();
    mockPlayersApi.update.mockRejectedValue(new Error('Wrestler already assigned'));

    renderComponent();
    await waitFor(() => { expect(screen.getByText('nowrestler@league.com')).toBeInTheDocument(); });

    await user.selectOptions(
      screen.getByLabelText('Assigned wrestler for nowrestler@league.com'),
      'w-omega',
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Wrestler already assigned');
    });
  });

  it('shows no wrestler or division control for a user with no linked player', async () => {
    setupMocks();
    renderComponent();
    await waitFor(() => { expect(screen.getByText('admin@league.com')).toBeInTheDocument(); });

    const adminRow = screen.getByText('admin@league.com').closest('tr')!;
    expect(within(adminRow).queryByRole('combobox')).not.toBeInTheDocument();
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
