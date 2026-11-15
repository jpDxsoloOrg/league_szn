import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usersApi, BULK_USERS_MAX } from '../../services/api';
import type { BulkUserAction, BulkUserResult, BulkUserRole } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import type { DataTableColumn } from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import AdminNotice from './AdminNotice';
import ConfirmModal from './ConfirmModal';
import SourceLoadNotice from './SourceLoadNotice';
import { settleSources } from './loadSources';
import './adminRoster.css';
import './ManageUsers.css';

interface CognitoUser {
  username: string;
  sub: string;
  email: string;
  name: string;
  wrestlerName: string;
  psnId: string;
  playerName: string;
  status: string;
  enabled: boolean;
  created: string;
  groups: string[];
}

type FilterTab = 'all' | 'wrestlers' | 'staff' | 'no-role' | 'disabled';

export const USERS_PAGE_SIZE = 50;
/** Word typed to confirm a bulk delete. Not translated, so it reads the same everywhere. */
export const BULK_DELETE_WORD = 'DELETE';
const FAILURES_SHOWN = 10;

const ROLE_TONES: Record<string, BadgeTone> = {
  Admin: 'pink',
  Moderator: 'violet',
  Wrestler: 'primary',
};

const USER_SOURCES = {
  users: () => usersApi.list(),
};

type UserSource = keyof typeof USER_SOURCES;

interface PendingBulk {
  action: BulkUserAction;
  role?: BulkUserRole;
}

interface BulkReport extends PendingBulk {
  total: number;
  succeeded: number;
  failures: BulkUserResult[];
}

const FILTERS: Record<FilterTab, (user: CognitoUser) => boolean> = {
  all: () => true,
  wrestlers: (user) => user.groups.includes('Wrestler'),
  staff: (user) => user.groups.includes('Admin') || user.groups.includes('Moderator'),
  'no-role': (user) => user.groups.length === 0,
  disabled: (user) => !user.enabled,
};

/** The name to show for an account: the player name, then the Cognito name, then the email. */
function displayName(user: CognitoUser): string {
  return user.playerName || user.name || user.email || user.username;
}

function matchesSearch(user: CognitoUser, query: string): boolean {
  if (!query) return true;
  return [user.email, user.name, user.playerName, user.psnId, user.wrestlerName]
    .some((value) => value.toLowerCase().includes(query));
}

/** The user as it is after a successful bulk action, or null once deleted. */
function applyBulk(user: CognitoUser, { action, role }: PendingBulk): CognitoUser | null {
  switch (action) {
    case 'enable':
      return { ...user, enabled: true };
    case 'disable':
      return { ...user, enabled: false };
    case 'addRole':
      return role && !user.groups.includes(role) ? { ...user, groups: [...user.groups, role] } : user;
    case 'removeRole':
      return { ...user, groups: user.groups.filter((group) => group !== role) };
    case 'delete':
      return null;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export default function ManageUsers() {
  const { t } = useTranslation();
  const { isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<CognitoUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedSources, setFailedSources] = useState<UserSource[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkRole, setBulkRole] = useState<BulkUserRole>('Wrestler');
  const [pendingBulk, setPendingBulk] = useState<PendingBulk | null>(null);
  const [deleteWord, setDeleteWord] = useState('');
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkReport, setBulkReport] = useState<BulkReport | null>(null);
  const [managedUsername, setManagedUsername] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { values, failed } = await settleSources(USER_SOURCES);
    if (values.users) {
      const loaded = values.users.users;
      setUsers(loaded);
      // Drop selections for accounts that no longer exist.
      const present = new Set(loaded.map((user) => user.username));
      setSelected((previous) => new Set([...previous].filter((username) => present.has(username))));
    }
    setFailedSources(failed);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const query = search.trim().toLowerCase();
  const filteredUsers = useMemo(
    () => users.filter((user) => FILTERS[activeFilter](user) && matchesSearch(user, query)),
    [users, activeFilter, query],
  );
  const counts = useMemo(() => {
    const result = {} as Record<FilterTab, number>;
    for (const key of Object.keys(FILTERS) as FilterTab[]) result[key] = users.filter(FILTERS[key]).length;
    return result;
  }, [users]);
  const usersByName = useMemo(() => new Map(users.map((user) => [user.username, user])), [users]);
  const selectedUsers = useMemo(
    () => [...selected].map((username) => usersByName.get(username)).filter((user): user is CognitoUser => !!user),
    [selected, usersByName],
  );
  const allShownSelected = filteredUsers.length > 0 && filteredUsers.every((user) => selected.has(user.username));
  const bulkBusy = bulkProgress !== null;

  const changeFilter = (value: FilterTab) => {
    setActiveFilter(value);
    setPage(0);
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const toggleSelected = (username: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  };

  const selectAllShown = () => {
    setSelected((previous) => new Set([...previous, ...filteredUsers.map((user) => user.username)]));
  };

  /**
   * Backfill every player's wrestler-role flag from Cognito. Safe to re-run.
   */
  const handleSyncRoles = async () => {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const result = await usersApi.syncRoles();
      setSyncResult(t('adminRoster.users.syncResult', {
        defaultValue: 'Synced {{total}} players — {{granted}} shown, {{revoked}} hidden, {{unchanged}} unchanged',
        total: result.totalPlayers,
        granted: result.granted,
        revoked: result.revoked,
        unchanged: result.unchanged,
      }));
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.users.syncError', 'Failed to sync wrestler roles'));
    } finally {
      setSyncing(false);
    }
  };

  const handleRoleAction = async (username: string, role: string, action: 'promote' | 'demote') => {
    setActionLoading(username);
    try {
      const result = await usersApi.updateRole(username, role, action);
      setUsers((previous) => previous.map((user) => (user.username === username ? { ...user, groups: result.groups } : user)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.users.roleError', 'Failed to update role'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleEnabled = async (username: string, currentlyEnabled: boolean) => {
    setActionLoading(username);
    try {
      const result = await usersApi.toggleEnabled(username, !currentlyEnabled);
      setUsers((previous) => previous.map((user) => (user.username === username ? { ...user, enabled: result.enabled } : user)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.users.statusError', 'Failed to update user status'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!pendingDelete) return;
    const username = pendingDelete;
    setActionLoading(username);
    try {
      await usersApi.deleteUser(username);
      setUsers((previous) => previous.filter((user) => user.username !== username));
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(username);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.users.deleteError', 'Failed to delete user'));
    } finally {
      setActionLoading(null);
      setPendingDelete(null);
    }
  };

  const openBulk = (action: BulkUserAction) => {
    setDeleteWord('');
    setPendingBulk(action === 'addRole' || action === 'removeRole' ? { action, role: bulkRole } : { action });
  };

  /**
   * Sends the selection in chunks the API accepts, one after another, then
   * applies what succeeded and keeps the failures selected for another look.
   */
  const runBulk = async () => {
    if (!pendingBulk) return;
    const request = pendingBulk;
    const usernames = selectedUsers.map((user) => user.username);
    setPendingBulk(null);
    setBulkReport(null);
    setError(null);
    setBulkProgress({ done: 0, total: usernames.length });

    const results: BulkUserResult[] = [];
    for (const batch of chunk(usernames, BULK_USERS_MAX)) {
      try {
        const response = await usersApi.bulk(request.action, batch, request.role);
        results.push(...response.results);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('adminRoster.users.bulkError', 'Request failed');
        results.push(...batch.map((username) => ({ username, ok: false, code: 'ERROR', message })));
      }
      setBulkProgress({ done: results.length, total: usernames.length });
    }

    const succeeded = new Set(results.filter((result) => result.ok).map((result) => result.username));
    setUsers((previous) => previous.flatMap((user) => {
      if (!succeeded.has(user.username)) return [user];
      const updated = applyBulk(user, request);
      return updated ? [updated] : [];
    }));
    setSelected((previous) => new Set([...previous].filter((username) => !succeeded.has(username))));
    setBulkReport({ ...request, total: usernames.length, succeeded: succeeded.size, failures: results.filter((result) => !result.ok) });
    setBulkProgress(null);
  };

  const actionLabel = ({ action, role }: PendingBulk): string => {
    switch (action) {
      case 'enable':
        return t('adminRoster.users.bulkEnable', 'Enable login');
      case 'disable':
        return t('adminRoster.users.bulkDisable', 'Disable login');
      case 'addRole':
        return t('adminRoster.users.bulkAddRoleNamed', { defaultValue: 'Add {{role}}', role });
      case 'removeRole':
        return t('adminRoster.users.bulkRemoveRoleNamed', { defaultValue: 'Remove {{role}}', role });
      case 'delete':
        return t('adminRoster.users.bulkDelete', 'Delete accounts');
    }
  };

  const enabledInSelection = selectedUsers.filter((user) => user.enabled).length;
  const managedUser = managedUsername ? usersByName.get(managedUsername) ?? null : null;

  const columns: DataTableColumn<CognitoUser>[] = [
    {
      key: 'select',
      header: t('adminRoster.users.select', 'Select'),
      render: (user) => (
        <input
          type="checkbox"
          className="users-select"
          aria-label={t('adminRoster.users.selectUser', { defaultValue: 'Select {{name}}', name: user.email || displayName(user) })}
          checked={selected.has(user.username)}
          disabled={bulkBusy}
          onChange={() => toggleSelected(user.username)}
        />
      ),
    },
    {
      key: 'user',
      header: t('adminRoster.users.user', 'User'),
      sortValue: (user) => displayName(user).toLowerCase(),
      render: (user) => (
        <span className="ar-stack">
          <span className="ar-strong">{displayName(user)}</span>
          {user.email && user.email !== displayName(user) && <span className="ar-sub">{user.email}</span>}
          {user.psnId && <span className="ar-sub">{t('adminRoster.users.psn', { defaultValue: 'PSN: {{id}}', id: user.psnId })}</span>}
        </span>
      ),
    },
    {
      key: 'roles',
      header: t('adminRoster.users.roles', 'Roles'),
      sortValue: (user) => user.groups.join(','),
      render: (user) => (
        <span className="ar-badges">
          {user.groups.length > 0
            ? user.groups.map((group) => <Badge key={group} tone={ROLE_TONES[group] ?? 'neutral'}>{group}</Badge>)
            : <span className="ar-sub">{t('adminRoster.users.noRoles', 'No roles')}</span>}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('adminRoster.users.status', 'Status'),
      sortValue: (user) => (user.enabled ? user.status : ''),
      render: (user) => (
        <Badge tone={user.enabled ? 'neutral' : 'loss'}>
          {user.enabled ? user.status : t('adminRoster.users.disabled', 'Disabled')}
        </Badge>
      ),
    },
    {
      key: 'joined',
      header: t('adminRoster.users.joined', 'Joined'),
      sortValue: (user) => user.created || '',
      render: (user) => (user.created ? new Date(user.created).toLocaleDateString() : '—'),
    },
    {
      key: 'actions',
      header: t('common.actions', 'Actions'),
      align: 'end',
      render: (user) => (
        <Button variant="secondary" size="sm" disabled={bulkBusy} onClick={() => setManagedUsername(user.username)}>
          {t('adminRoster.users.manage', 'Manage')}
        </Button>
      ),
    },
  ];

  /** One role button in the Manage dialog. */
  const roleButton = (user: CognitoUser, role: string, action: 'promote' | 'demote', label: string) => (
    <Button
      variant={action === 'promote' ? 'secondary' : 'ghost'}
      disabled={actionLoading === user.username}
      onClick={() => handleRoleAction(user.username, role, action)}
    >
      {label}
    </Button>
  );

  const failureLabel = (result: BulkUserResult) => {
    const user = usersByName.get(result.username);
    return user ? user.email || displayName(user) : result.username;
  };

  return (
    <div className="ar-page manage-users">
      <PageHeader
        title={t('adminRoster.users.title', 'User Management')}
        actions={(
          <>
            <Button
              variant="secondary"
              loading={syncing}
              onClick={handleSyncRoles}
              title={t('adminRoster.users.syncHint', "Update every player's visibility from their Cognito Wrestler role")}
            >
              {syncing ? t('adminRoster.users.syncing', 'Syncing...') : t('adminRoster.users.sync', 'Sync Wrestler Roles')}
            </Button>
            <Button variant="ghost" onClick={fetchData} disabled={bulkBusy}>{t('adminRoster.users.refresh', 'Refresh')}</Button>
          </>
        )}
      />

      {syncResult && (
        <AdminNotice tone="success" dismissLabel={t('adminRoster.dismiss', 'Dismiss')} onDismiss={() => setSyncResult(null)}>
          {syncResult}
        </AdminNotice>
      )}

      {bulkProgress && (
        <AdminNotice tone="info">
          {t('adminRoster.users.bulkWorking', {
            defaultValue: 'Working… {{done}} of {{total}} done',
            done: bulkProgress.done,
            total: bulkProgress.total,
          })}
        </AdminNotice>
      )}

      {bulkReport && (
        <AdminNotice
          tone={bulkReport.failures.length === 0 ? 'success' : 'warning'}
          dismissLabel={t('adminRoster.dismiss', 'Dismiss')}
          onDismiss={() => setBulkReport(null)}
        >
          {t('adminRoster.users.bulkDone', {
            defaultValue: '{{action}}: {{succeeded}} of {{total}} done.',
            action: actionLabel(bulkReport),
            succeeded: bulkReport.succeeded,
            total: bulkReport.total,
          })}
          {bulkReport.failures.length > 0 && (
            <>
              {' '}
              {t('adminRoster.users.bulkFailuresKept', 'The ones that failed are still selected:')}
              <ul className="ar-notice__list">
                {bulkReport.failures.slice(0, FAILURES_SHOWN).map((failure) => (
                  <li key={failure.username}>{failureLabel(failure)}: {failure.message || failure.code}</li>
                ))}
              </ul>
              {bulkReport.failures.length > FAILURES_SHOWN && t('adminRoster.users.bulkMoreFailures', {
                defaultValue: 'and {{count}} more',
                count: bulkReport.failures.length - FAILURES_SHOWN,
              })}
            </>
          )}
        </AdminNotice>
      )}

      <SourceLoadNotice failed={failedSources} onRetry={fetchData} retrying={loading} />
      {error && (
        <AdminNotice tone="error" dismissLabel={t('adminRoster.dismiss', 'Dismiss')} onDismiss={() => setError(null)}>
          {error}
        </AdminNotice>
      )}

      {loading ? <Skeleton variant="table" /> : (
        <>
          <Tabs
            label={t('adminRoster.users.filterLabel', 'Filter users')}
            value={activeFilter}
            onValueChange={(value) => changeFilter(value as FilterTab)}
            items={[
              { value: 'all', label: `${t('adminRoster.users.tabAll', 'All Users')} (${counts.all})` },
              { value: 'wrestlers', label: `${t('adminRoster.users.tabWrestlers', 'Wrestlers')} (${counts.wrestlers})` },
              { value: 'staff', label: `${t('adminRoster.users.tabStaff', 'Admins & Moderators')} (${counts.staff})` },
              { value: 'no-role', label: `${t('adminRoster.users.tabNoRole', 'No Role')} (${counts['no-role']})` },
              { value: 'disabled', label: `${t('adminRoster.users.tabDisabled', 'Disabled')} (${counts.disabled})` },
            ]}
          />

          <div className="ar-toolbar__filters">
            <input
              className="ar-input ar-input--search"
              type="search"
              aria-label={t('adminRoster.users.search', 'Search by name, email or PSN')}
              placeholder={t('adminRoster.users.search', 'Search by name, email or PSN')}
              value={search}
              onChange={(event) => changeSearch(event.target.value)}
            />
            <span className="ar-count">
              {t('adminRoster.users.shownCount', { defaultValue: '{{count}} users', count: filteredUsers.length })}
            </span>
          </div>

          <section className="users-bulk" aria-label={t('adminRoster.users.bulkLabel', 'Bulk actions')}>
            <div className="users-bulk__selection">
              <strong>{t('adminRoster.users.selectedCount', { defaultValue: '{{count}} selected', count: selectedUsers.length })}</strong>
              {!allShownSelected && filteredUsers.length > 0 && (
                <Button variant="ghost" size="sm" disabled={bulkBusy} onClick={selectAllShown}>
                  {t('adminRoster.users.selectAllShown', { defaultValue: 'Select all {{count}} shown', count: filteredUsers.length })}
                </Button>
              )}
              {selectedUsers.length > 0 && (
                <Button variant="ghost" size="sm" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
                  {t('adminRoster.users.clearSelection', 'Clear selection')}
                </Button>
              )}
            </div>
            <div className="users-bulk__actions">
              <Button variant="secondary" size="sm" disabled={selectedUsers.length === 0 || bulkBusy} onClick={() => openBulk('enable')}>
                {t('adminRoster.users.bulkEnable', 'Enable login')}
              </Button>
              <Button variant="secondary" size="sm" disabled={selectedUsers.length === 0 || bulkBusy} onClick={() => openBulk('disable')}>
                {t('adminRoster.users.bulkDisable', 'Disable login')}
              </Button>
              <span className="users-bulk__role">
                <select
                  className="ar-input"
                  aria-label={t('adminRoster.users.bulkRole', 'Role for bulk change')}
                  value={bulkRole}
                  disabled={bulkBusy}
                  onChange={(event) => setBulkRole(event.target.value as BulkUserRole)}
                >
                  <option value="Wrestler">Wrestler</option>
                  {isSuperAdmin && <option value="Moderator">Moderator</option>}
                </select>
                <Button variant="secondary" size="sm" disabled={selectedUsers.length === 0 || bulkBusy} onClick={() => openBulk('addRole')}>
                  {t('adminRoster.users.bulkAddRole', 'Add role')}
                </Button>
                <Button variant="secondary" size="sm" disabled={selectedUsers.length === 0 || bulkBusy} onClick={() => openBulk('removeRole')}>
                  {t('adminRoster.users.bulkRemoveRole', 'Remove role')}
                </Button>
              </span>
              <Button variant="danger" size="sm" disabled={selectedUsers.length === 0 || bulkBusy} onClick={() => openBulk('delete')}>
                {t('adminRoster.users.bulkDelete', 'Delete accounts')}
              </Button>
            </div>
          </section>

          <DataTable
            className="ar-table users-table"
            caption={t('adminRoster.users.title', 'User Management')}
            density="dense"
            columns={columns}
            rows={filteredUsers}
            rowKey={(user) => user.username}
            pagination={{ page, pageSize: USERS_PAGE_SIZE, onPageChange: setPage }}
            empty={failedSources.includes('users')
              ? undefined
              : <EmptyState title={t('adminRoster.users.empty', 'No users found for this filter.')} />}
          />
        </>
      )}

      <Modal
        open={managedUser !== null}
        onClose={() => setManagedUsername(null)}
        title={managedUser ? managedUser.email || displayName(managedUser) : t('adminRoster.users.manage', 'Manage')}
        description={t('adminRoster.users.manageHint', 'Change this account\'s roles and access.')}
      >
        {managedUser && (
          <div className="ar-form">
            <section className="ar-field" aria-label={t('adminRoster.users.roles', 'Roles')}>
              <span className="ar-field__label">{t('adminRoster.users.roles', 'Roles')}</span>
              <div className="user-manage-actions">
                {!managedUser.groups.includes('Wrestler')
                  && roleButton(managedUser, 'Wrestler', 'promote', t('adminRoster.users.makeWrestler', 'Make Wrestler'))}
                {managedUser.groups.includes('Wrestler')
                  && roleButton(managedUser, 'Wrestler', 'demote', t('adminRoster.users.removeWrestler', 'Remove Wrestler'))}
                {isSuperAdmin && !managedUser.groups.includes('Admin') && !managedUser.groups.includes('Moderator')
                  && roleButton(managedUser, 'Moderator', 'promote', t('adminRoster.users.makeModerator', 'Make Moderator'))}
                {isSuperAdmin && managedUser.groups.includes('Moderator')
                  && roleButton(managedUser, 'Moderator', 'demote', t('adminRoster.users.removeModerator', 'Remove Moderator'))}
                {isSuperAdmin && !managedUser.groups.includes('Admin')
                  && roleButton(managedUser, 'Admin', 'promote', t('adminRoster.users.makeAdmin', 'Make Admin'))}
                {isSuperAdmin && managedUser.groups.includes('Admin')
                  && roleButton(managedUser, 'Admin', 'demote', t('adminRoster.users.removeAdmin', 'Remove Admin'))}
              </div>
            </section>

            <section className="ar-field" aria-label={t('adminRoster.users.account', 'Account')}>
              <span className="ar-field__label">{t('adminRoster.users.account', 'Account')}</span>
              <div className="user-manage-actions">
                <Button
                  variant="secondary"
                  disabled={actionLoading === managedUser.username}
                  onClick={() => handleToggleEnabled(managedUser.username, managedUser.enabled)}
                >
                  {managedUser.enabled ? t('adminRoster.users.disable', 'Disable') : t('adminRoster.users.enable', 'Enable')}
                </Button>
                {!managedUser.enabled && (
                  <Button
                    variant="danger"
                    disabled={actionLoading === managedUser.username}
                    onClick={() => {
                      setPendingDelete(managedUser.username);
                      setManagedUsername(null);
                    }}
                  >
                    {t('common.delete', 'Delete')}
                  </Button>
                )}
              </div>
            </section>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={pendingBulk !== null}
        title={pendingBulk ? actionLabel(pendingBulk) : ''}
        message={t('adminRoster.users.bulkConfirm', {
          defaultValue: 'Apply "{{action}}" to {{count}} selected users?',
          action: pendingBulk ? actionLabel(pendingBulk) : '',
          count: selectedUsers.length,
        })}
        confirmLabel={pendingBulk ? actionLabel(pendingBulk) : ''}
        confirmDisabled={pendingBulk?.action === 'delete' && deleteWord !== BULK_DELETE_WORD}
        onConfirm={runBulk}
        onCancel={() => setPendingBulk(null)}
      >
        <p className="ar-hint">{t('adminRoster.users.bulkSelfNote', 'Your own account is skipped for disable, delete and remove role.')}</p>
        {pendingBulk?.action === 'delete' && (
          <div className="ar-field">
            <p className="ar-hint">
              {t('adminRoster.users.bulkDeleteWarning', 'This permanently deletes the accounts and cannot be undone. Only disabled accounts can be deleted.')}
              {enabledInSelection > 0 && ` ${t('adminRoster.users.bulkDeleteEnabled', {
                defaultValue: '{{count}} of the selected accounts are still enabled and will be skipped.',
                count: enabledInSelection,
              })}`}
            </p>
            <label className="ar-field__label" htmlFor="users-bulk-delete-word">
              {t('adminRoster.users.bulkDeleteType', { defaultValue: 'Type {{word}} to confirm', word: BULK_DELETE_WORD })}
            </label>
            <input
              id="users-bulk-delete-word"
              className="ar-input"
              autoComplete="off"
              value={deleteWord}
              onChange={(event) => setDeleteWord(event.target.value)}
            />
          </div>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={pendingDelete !== null}
        title={t('adminRoster.users.deleteTitle', 'Delete user')}
        message={t('adminRoster.users.deleteConfirm', {
          defaultValue: 'Permanently delete user "{{username}}"? This cannot be undone.',
          username: pendingDelete ? (usersByName.get(pendingDelete)?.email || pendingDelete) : '',
        })}
        confirmLabel={t('common.delete', 'Delete')}
        busy={actionLoading !== null}
        onConfirm={handleDeleteUser}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
