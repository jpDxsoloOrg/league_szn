import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockUsersApi, mockUseAuth } = vi.hoisted(() => ({
  mockUsersApi: {
    list: vi.fn(), updateRole: vi.fn(), toggleEnabled: vi.fn(),
    deleteUser: vi.fn(), syncRoles: vi.fn(), bulk: vi.fn(),
  },
  mockUseAuth: vi.fn(),
}));

vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);

vi.mock('../../../services/api', () => ({
  usersApi: mockUsersApi,
  BULK_USERS_MAX: 50,
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

import ManageUsers, { USERS_PAGE_SIZE } from '../ManageUsers';
import type { BulkUserAction } from '../../../services/api';

// --- Test data ---
interface CognitoUser {
  username: string; sub: string; email: string; name: string;
  wrestlerName: string; psnId: string; playerName: string; status: string; enabled: boolean;
  created: string; groups: string[];
}

function account(overrides: Partial<CognitoUser> & Pick<CognitoUser, 'username' | 'email'>): CognitoUser {
  return {
    sub: `sub-${overrides.username}`, name: '', wrestlerName: '', psnId: '', playerName: '',
    status: 'CONFIRMED', enabled: true, created: '2024-01-01T00:00:00Z', groups: [],
    ...overrides,
  };
}

const mockUsers: CognitoUser[] = [
  account({ username: 'admin-user', email: 'admin@league.com', name: 'Admin', groups: ['Admin'] }),
  account({
    username: 'wrestler-user', email: 'wrestler@league.com', playerName: 'Rocky',
    psnId: 'rocky_psn', wrestlerName: 'The Rock', groups: ['Wrestler'], created: '2024-02-01T00:00:00Z',
  }),
  account({ username: 'plain-user', email: 'plain@league.com', name: 'Plain' }),
  account({ username: 'disabled-user', email: 'disabled@league.com', name: 'Disabled', enabled: false }),
  account({ username: 'mod-user', email: 'mod@league.com', name: 'Moderator', groups: ['Moderator'] }),
];

function setupMocks(overrides: { isSuperAdmin?: boolean; users?: CognitoUser[] } = {}) {
  mockUseAuth.mockReturnValue({ isSuperAdmin: overrides.isSuperAdmin ?? true });
  mockUsersApi.list.mockResolvedValue({ users: overrides.users ?? mockUsers });
}

/** Every bulk request succeeds for every user it names. */
function bulkSucceeds() {
  mockUsersApi.bulk.mockImplementation(async (action: BulkUserAction, usernames: string[]) => ({
    action,
    results: usernames.map((username) => ({ username, ok: true })),
    succeeded: usernames.length,
    failed: 0,
  }));
}

async function renderLoaded(waitForText = 'admin@league.com') {
  render(<BrowserRouter><ManageUsers /></BrowserRouter>);
  await screen.findByText(waitForText);
}

const rowOf = (text: string) => screen.getByText(text).closest('tr')!;

/** Opens the Manage dialog from a user's row. */
async function openManage(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.click(within(rowOf(email)).getByRole('button', { name: 'Manage' }));
  return screen.findByRole('dialog');
}

async function select(user: ReturnType<typeof userEvent.setup>, ...emails: string[]) {
  for (const email of emails) await user.click(screen.getByRole('checkbox', { name: `Select ${email}` }));
}

describe('ManageUsers', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows user, roles, status and joined, and no wrestler or division columns', async () => {
    setupMocks();
    await renderLoaded();

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toEqual(['Select', 'User', 'Roles', 'Status', 'Joined', 'Actions']);

    const row = rowOf('wrestler@league.com');
    expect(within(row).getByText('Rocky')).toBeInTheDocument();
    expect(within(row).getByText('PSN: rocky_psn')).toBeInTheDocument();
    expect(within(row).getByText('Wrestler')).toBeInTheDocument();
    expect(within(row).queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('syncs wrestler roles and reports the result', async () => {
    const user = userEvent.setup();
    setupMocks();
    mockUsersApi.syncRoles.mockResolvedValue({ message: 'ok', totalPlayers: 12, granted: 9, revoked: 3, unchanged: 0 });
    await renderLoaded();

    await user.click(screen.getByRole('button', { name: 'Sync Wrestler Roles' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Synced 12 players — 9 shown, 3 hidden, 0 unchanged');
    });
    await waitFor(() => { expect(mockUsersApi.list).toHaveBeenCalledTimes(2); });
  });

  it('surfaces an error when the role sync fails', async () => {
    const user = userEvent.setup();
    setupMocks();
    mockUsersApi.syncRoles.mockRejectedValue(new Error('Cognito unavailable'));
    await renderLoaded();

    await user.click(screen.getByRole('button', { name: 'Sync Wrestler Roles' }));

    await waitFor(() => { expect(screen.getByRole('alert')).toHaveTextContent('Cognito unavailable'); });
  });

  it('filters by tab with counts', async () => {
    const user = userEvent.setup();
    setupMocks();
    await renderLoaded();

    await user.click(screen.getByRole('tab', { name: 'Wrestlers (1)' }));
    expect(screen.getByText('wrestler@league.com')).toBeInTheDocument();
    expect(screen.queryByText('admin@league.com')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Admins & Moderators (2)' }));
    expect(screen.getByText('admin@league.com')).toBeInTheDocument();
    expect(screen.getByText('mod@league.com')).toBeInTheDocument();
    expect(screen.queryByText('wrestler@league.com')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'No Role (2)' }));
    expect(screen.getByText('plain@league.com')).toBeInTheDocument();
    expect(screen.getByText('disabled@league.com')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Disabled (1)' }));
    expect(screen.getByText('disabled@league.com')).toBeInTheDocument();
    expect(screen.queryByText('plain@league.com')).not.toBeInTheDocument();
  });

  it('searches email, name, PSN and wrestler name', async () => {
    const user = userEvent.setup();
    setupMocks();
    await renderLoaded();
    const search = screen.getByRole('searchbox', { name: 'Search by name, email or PSN' });

    for (const query of ['ROCKY_PSN', 'the rock', 'wrestler@']) {
      await user.clear(search);
      await user.type(search, query);
      expect(screen.getByText('wrestler@league.com')).toBeInTheDocument();
      expect(screen.queryByText('admin@league.com')).not.toBeInTheDocument();
    }
  });

  it(`pages the list ${USERS_PAGE_SIZE} at a time`, async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: USERS_PAGE_SIZE + 5 }, (_, index) =>
      account({ username: `u${String(index).padStart(3, '0')}`, email: `u${String(index).padStart(3, '0')}@league.com` }));
    setupMocks({ users: many });
    await renderLoaded('u000@league.com');

    expect(screen.getAllByRole('checkbox')).toHaveLength(USERS_PAGE_SIZE);
    expect(screen.getByText(`Page 1 of 2 · 1–${USERS_PAGE_SIZE} of ${USERS_PAGE_SIZE + 5}`)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    expect(screen.queryByText('u000@league.com')).not.toBeInTheDocument();
    expect(screen.getByText(`u${String(USERS_PAGE_SIZE).padStart(3, '0')}@league.com`)).toBeInTheDocument();

    // A new search starts again from the first page.
    await user.type(screen.getByRole('searchbox'), 'u00');
    expect(screen.getByText('u000@league.com')).toBeInTheDocument();
  });

  it('disables the selected users in one bulk request and updates their rows', async () => {
    const user = userEvent.setup();
    setupMocks();
    bulkSucceeds();
    await renderLoaded();

    await select(user, 'plain@league.com', 'mod@league.com');
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Disable login' }));
    const dialog = await screen.findByRole('dialog', { name: 'Disable login' });
    expect(dialog).toHaveTextContent('Apply "Disable login" to 2 selected users?');
    await user.click(within(dialog).getByRole('button', { name: 'Disable login' }));

    await waitFor(() => { expect(screen.getByText('Disable login: 2 of 2 done.')).toBeInTheDocument(); });
    expect(mockUsersApi.bulk).toHaveBeenCalledWith('disable', ['plain-user', 'mod-user'], undefined);
    expect(within(rowOf('plain@league.com')).getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('adds the chosen role to the selection', async () => {
    const user = userEvent.setup();
    setupMocks();
    bulkSucceeds();
    await renderLoaded();

    await select(user, 'plain@league.com');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Role for bulk change' }), 'Moderator');
    await user.click(screen.getByRole('button', { name: 'Add role' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Add Moderator' })).getByRole('button', { name: 'Add Moderator' }));

    await waitFor(() => { expect(mockUsersApi.bulk).toHaveBeenCalledWith('addRole', ['plain-user'], 'Moderator'); });
    await waitFor(() => { expect(within(rowOf('plain@league.com')).getByText('Moderator')).toBeInTheDocument(); });
  });

  it('only offers Wrestler for bulk role changes to a non-super admin', async () => {
    setupMocks({ isSuperAdmin: false });
    await renderLoaded();
    const roles = within(screen.getByRole('combobox', { name: 'Role for bulk change' })).getAllByRole('option');
    expect(roles.map((option) => option.textContent)).toEqual(['Wrestler']);
  });

  it('selects every user the filter shows, across pages, and sends them in chunks of 50', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 120 }, (_, index) => account({ username: `u${index}`, email: `u${index}@league.com` }));
    setupMocks({ users: many });
    bulkSucceeds();
    await renderLoaded('u0@league.com');

    await user.click(screen.getByRole('button', { name: 'Select all 120 shown' }));
    expect(screen.getByText('120 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enable login' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Enable login' }));

    await waitFor(() => { expect(screen.getByText('Enable login: 120 of 120 done.')).toBeInTheDocument(); });
    expect(mockUsersApi.bulk.mock.calls.map(([, usernames]) => (usernames as string[]).length)).toEqual([50, 50, 20]);
  });

  it('keeps failed users selected and lists why', async () => {
    const user = userEvent.setup();
    setupMocks();
    mockUsersApi.bulk.mockResolvedValue({
      action: 'enable',
      results: [
        { username: 'disabled-user', ok: false, code: 'PLAYER_DEACTIVATED', message: 'This player is deactivated.' },
        { username: 'plain-user', ok: true },
      ],
      succeeded: 1,
      failed: 1,
    });
    await renderLoaded();

    await select(user, 'disabled@league.com', 'plain@league.com');
    await user.click(screen.getByRole('button', { name: 'Enable login' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Enable login' }));

    await waitFor(() => { expect(screen.getByText(/Enable login: 1 of 2 done/)).toBeInTheDocument(); });
    expect(screen.getByText('disabled@league.com: This player is deactivated.')).toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select disabled@league.com' })).toBeChecked();
  });

  it('reports a failed request against every user in that chunk', async () => {
    const user = userEvent.setup();
    setupMocks();
    mockUsersApi.bulk.mockRejectedValue(new Error('Network down'));
    await renderLoaded();

    await select(user, 'plain@league.com');
    await user.click(screen.getByRole('button', { name: 'Disable login' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Disable login' }));

    await waitFor(() => { expect(screen.getByText('plain@league.com: Network down')).toBeInTheDocument(); });
    expect(within(rowOf('plain@league.com')).queryByText('Disabled')).not.toBeInTheDocument();
  });

  it('asks for the typed word before a bulk delete and drops deleted rows', async () => {
    const user = userEvent.setup();
    setupMocks();
    bulkSucceeds();
    await renderLoaded();

    await select(user, 'disabled@league.com', 'plain@league.com');
    await user.click(screen.getByRole('button', { name: 'Delete accounts' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete accounts' });
    expect(dialog).toHaveTextContent('1 of the selected accounts are still enabled and will be skipped.');

    const confirm = within(dialog).getByRole('button', { name: 'Delete accounts' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Type DELETE to confirm'), 'delete');
    expect(confirm).toBeDisabled();
    await user.clear(within(dialog).getByLabelText('Type DELETE to confirm'));
    await user.type(within(dialog).getByLabelText('Type DELETE to confirm'), 'DELETE');
    await user.click(confirm);

    await waitFor(() => { expect(screen.queryByText('disabled@league.com')).not.toBeInTheDocument(); });
    expect(mockUsersApi.bulk).toHaveBeenCalledWith('delete', ['disabled-user', 'plain-user'], undefined);
  });

  it('demotes a wrestler from the Manage dialog', async () => {
    const user = userEvent.setup();
    setupMocks();
    mockUsersApi.updateRole.mockResolvedValue({ message: 'Role updated', username: 'wrestler-user', groups: [] });
    await renderLoaded();

    const dialog = await openManage(user, 'wrestler@league.com');
    await user.click(within(dialog).getByRole('button', { name: 'Remove Wrestler' }));

    await waitFor(() => { expect(mockUsersApi.updateRole).toHaveBeenCalledWith('wrestler-user', 'Wrestler', 'demote'); });
  });

  it('disables one user from the Manage dialog', async () => {
    const user = userEvent.setup();
    setupMocks();
    mockUsersApi.toggleEnabled.mockResolvedValue({ message: 'User updated', username: 'wrestler-user', enabled: false });
    await renderLoaded();

    const dialog = await openManage(user, 'wrestler@league.com');
    await user.click(within(dialog).getByRole('button', { name: 'Disable' }));

    await waitFor(() => { expect(mockUsersApi.toggleEnabled).toHaveBeenCalledWith('wrestler-user', false); });
  });

  it('shows SuperAdmin-only role actions when isSuperAdmin is true', async () => {
    const user = userEvent.setup();
    setupMocks({ isSuperAdmin: true });
    await renderLoaded();

    let dialog = await openManage(user, 'plain@league.com');
    expect(within(dialog).getByRole('button', { name: 'Make Moderator' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Make Admin' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    dialog = await openManage(user, 'mod@league.com');
    expect(within(dialog).getByRole('button', { name: 'Remove Moderator' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    dialog = await openManage(user, 'admin@league.com');
    expect(within(dialog).getByRole('button', { name: 'Remove Admin' })).toBeInTheDocument();
  });

  it('hides Admin/Moderator role actions when not SuperAdmin', async () => {
    const user = userEvent.setup();
    setupMocks({ isSuperAdmin: false });
    await renderLoaded();

    const dialog = await openManage(user, 'plain@league.com');
    expect(within(dialog).queryByRole('button', { name: 'Make Moderator' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Make Admin' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Make Wrestler' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Disable' })).toBeInTheDocument();
  });

  it('deletes one disabled user after confirming', async () => {
    const user = userEvent.setup();
    setupMocks();
    mockUsersApi.deleteUser.mockResolvedValue(undefined);
    await renderLoaded();

    const manageDialog = await openManage(user, 'disabled@league.com');
    await user.click(within(manageDialog).getByRole('button', { name: 'Delete' }));
    const confirmDialog = await screen.findByRole('dialog', { name: 'Delete user' });
    await user.click(within(confirmDialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => { expect(mockUsersApi.deleteUser).toHaveBeenCalledWith('disabled-user'); });
    await waitFor(() => { expect(screen.queryByText('disabled@league.com')).not.toBeInTheDocument(); });
  });
});
