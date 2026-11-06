import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usersApi, playersApi, divisionsApi, wrestlersApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import type { Division, Wrestler } from '../../types';
import { isNeedsWrestler } from '../../utils/needsWrestler';
import { buildWrestlerOptionGroups } from '../../utils/wrestlerOptions';
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
import HiddenBadge from './HiddenBadge';
import './adminRoster.css';
import './ManageUsers.css';

/**
 * The player record linked to a Cognito user, as returned by `GET /admin/users`.
 * This comes from the users endpoint rather than `GET /players` on purpose:
 * that roster endpoint hides players without a `currentWrestler`, which would
 * leave a newly-approved Wrestler with no way to be slotted into a division.
 */
interface LinkedPlayer {
  playerId: string;
  divisionId: string;
  currentWrestler: string;
  currentWrestlerId: string;
}

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
  player: LinkedPlayer | null;
}

type FilterTab = 'all' | 'wrestler-requests' | 'wrestlers' | 'admins' | 'disabled';

const ROLE_TONES: Record<string, BadgeTone> = {
  Admin: 'pink',
  Moderator: 'violet',
  Wrestler: 'primary',
};

export default function ManageUsers() {
  const { t } = useTranslation();
  const { isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<CognitoUser[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [divisionLoading, setDivisionLoading] = useState<string | null>(null);
  const [wrestlerLoading, setWrestlerLoading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [managedUsername, setManagedUsername] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [usersResult, divisionsData, wrestlersData] = await Promise.all([
        usersApi.list(),
        divisionsApi.getAll(),
        wrestlersApi.getAll(),
      ]);
      setUsers(usersResult.users);
      setDivisions(divisionsData);
      setWrestlers(wrestlersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.users.loadError', 'Failed to load data'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDivisionChange = async (playerId: string, divisionId: string) => {
    setDivisionLoading(playerId);
    try {
      await playersApi.update(playerId, { divisionId: divisionId || undefined });
      setUsers(prev =>
        prev.map(u =>
          u.player?.playerId === playerId
            ? { ...u, player: { ...u.player, divisionId } }
            : u
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.users.divisionError', 'Failed to update division'));
    } finally {
      setDivisionLoading(null);
    }
  };

  /**
   * Assign (or clear) the primary wrestler slot for a user's player. The
   * backend denormalizes the wrestler's name onto `currentWrestler`, which is
   * what standings, check-ins and the dashboard filter on — so this is what
   * takes an approved Wrestler from "invisible" to a full roster member.
   */
  const handleWrestlerChange = async (playerId: string, wrestlerId: string) => {
    setWrestlerLoading(playerId);
    setError(null);
    try {
      const updated = await playersApi.update(playerId, {
        currentWrestlerId: wrestlerId,
      });
      setUsers(prev =>
        prev.map(u =>
          u.player?.playerId === playerId
            ? {
                ...u,
                player: {
                  ...u.player,
                  currentWrestler: updated.currentWrestler || '',
                  currentWrestlerId: updated.currentWrestlerId || '',
                },
              }
            : u
        )
      );
      // Refresh the roster so the newly-used wrestler drops out of the other
      // rows' dropdowns (and any released one comes back).
      setWrestlers(await wrestlersApi.getAll());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.users.wrestlerError', 'Failed to assign wrestler'));
    } finally {
      setWrestlerLoading(null);
    }
  };

  /**
   * Backfill every player's wrestler-role flag from Cognito. Needed once
   * after this filter ships: players created before it have no flag and stay
   * visible until stamped. Safe to re-run.
   */
  const handleSyncRoles = async () => {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const result = await usersApi.syncRoles();
      const summary = t('adminRoster.users.syncResult', {
        defaultValue: 'Synced {{total}} players — {{granted}} shown, {{revoked}} hidden, {{unchanged}} unchanged',
        total: result.totalPlayers,
        granted: result.granted,
        revoked: result.revoked,
        unchanged: result.unchanged,
      });
      setSyncResult(
        result.skipped > 0
          ? `${summary}, ${t('adminRoster.users.syncSkipped', { defaultValue: '{{count}} skipped', count: result.skipped })}`
          : summary,
      );
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
      // Update user in local state
      setUsers((prev) =>
        prev.map((u) =>
          u.username === username ? { ...u, groups: result.groups } : u
        )
      );
      // Re-fetch users since promoting to Wrestler auto-creates a Player
      // record, and the division slot only renders once that link exists.
      if (action === 'promote' && role === 'Wrestler') {
        const refreshed = await usersApi.list();
        setUsers(refreshed.users);
      }
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
      setUsers((prev) =>
        prev.map((u) =>
          u.username === username ? { ...u, enabled: result.enabled } : u
        )
      );
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
      setUsers((prev) => prev.filter((u) => u.username !== username));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.users.deleteError', 'Failed to delete user'));
    } finally {
      setActionLoading(null);
      setPendingDelete(null);
    }
  };

  const wrestlerRequests = users.filter(
    (u) => u.wrestlerName && !u.groups.includes('Wrestler')
  );

  const disabledUsers = users.filter((u) => !u.enabled);

  const filteredUsers = (() => {
    switch (activeFilter) {
      case 'wrestler-requests':
        return wrestlerRequests;
      case 'wrestlers':
        return users.filter((u) => u.groups.includes('Wrestler'));
      case 'admins':
        return users.filter((u) => u.groups.includes('Admin') || u.groups.includes('Moderator'));
      case 'disabled':
        return disabledUsers;
      default:
        return users;
    }
  })();

  const managedUser = users.find((user) => user.username === managedUsername) ?? null;

  const renderWrestlerCell = (user: CognitoUser) => {
    const linkedPlayer = user.player;
    if (!linkedPlayer) return '—';
    if (wrestlerLoading === linkedPlayer.playerId) {
      return <span className="ar-sub">{t('common.saving', 'Saving...')}</span>;
    }
    const options = buildWrestlerOptionGroups(wrestlers, linkedPlayer.currentWrestlerId || undefined, undefined);
    return (
      <span className="ar-stack">
        <select
          className="ar-input"
          aria-label={`${t('adminRoster.users.assignedWrestlerFor', 'Assigned wrestler for')} ${user.email}`}
          value={linkedPlayer.currentWrestlerId}
          onChange={(e) => handleWrestlerChange(linkedPlayer.playerId, e.target.value)}
        >
          <option value="">{t('adminRoster.users.noWrestler', 'No Wrestler')}</option>
          {options.map(({ promotion, wrestlers: group }) => (
            <optgroup key={promotion} label={promotion}>
              {group.map((w) => (
                <option key={w.wrestlerId} value={w.wrestlerId}>{w.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {isNeedsWrestler(linkedPlayer.currentWrestler) && <HiddenBadge />}
      </span>
    );
  };

  const renderDivisionCell = (user: CognitoUser) => {
    const linkedPlayer = user.player;
    if (!linkedPlayer) return '—';
    if (divisionLoading === linkedPlayer.playerId) {
      return <span className="ar-sub">{t('common.saving', 'Saving...')}</span>;
    }
    return (
      <select
        className="ar-input"
        aria-label={`${t('adminRoster.users.divisionFor', 'Division for')} ${user.email}`}
        value={linkedPlayer.divisionId || ''}
        onChange={(e) => handleDivisionChange(linkedPlayer.playerId, e.target.value)}
      >
        <option value="">{t('adminRoster.players.noDivision', 'No Division')}</option>
        {divisions.map((division) => (
          <option key={division.divisionId} value={division.divisionId}>{division.name}</option>
        ))}
      </select>
    );
  };

  const columns: DataTableColumn<CognitoUser>[] = [
    {
      key: 'user',
      header: t('adminRoster.users.user', 'User'),
      sortValue: (user) => user.email,
      render: (user) => (
        <span className="ar-stack">
          <span className="ar-strong">{user.email}</span>
          {user.wrestlerName && <span className="ar-sub">{user.wrestlerName}</span>}
        </span>
      ),
    },
    {
      key: 'roles',
      header: t('adminRoster.users.roles', 'Roles'),
      render: (user) => (
        <span className="ar-badges">
          {user.groups.length > 0
            ? user.groups.map((group) => <Badge key={group} tone={ROLE_TONES[group] ?? 'neutral'}>{group}</Badge>)
            : <span className="ar-sub">{t('adminRoster.users.noRoles', 'No roles')}</span>}
        </span>
      ),
    },
    { key: 'wrestler', header: t('adminRoster.users.assignedWrestler', 'Assigned Wrestler'), render: renderWrestlerCell },
    { key: 'division', header: t('adminRoster.users.division', 'Division'), render: renderDivisionCell },
    {
      key: 'status',
      header: t('adminRoster.users.status', 'Status'),
      sortValue: (user) => (user.enabled ? user.status : ''),
      render: (user) => (
        <span className="ar-stack">
          <Badge tone={user.enabled ? 'neutral' : 'loss'}>
            {user.enabled ? user.status : t('adminRoster.users.disabled', 'Disabled')}
          </Badge>
          {user.created && <span className="ar-sub">{new Date(user.created).toLocaleDateString()}</span>}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions', 'Actions'),
      align: 'end',
      render: (user) => (
        <div className="ar-row-actions">
          {user.wrestlerName && !user.groups.includes('Wrestler') && (
            <Button
              size="sm"
              loading={actionLoading === user.username}
              onClick={() => handleRoleAction(user.username, 'Wrestler', 'promote')}
            >
              {t('adminRoster.users.approveWrestler', 'Approve Wrestler')}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setManagedUsername(user.username)}>
            {t('adminRoster.users.manage', 'Manage')}
          </Button>
        </div>
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
            <Button variant="ghost" onClick={fetchData}>{t('adminRoster.users.refresh', 'Refresh')}</Button>
          </>
        )}
      />

      {syncResult && (
        <AdminNotice tone="success" dismissLabel={t('adminRoster.dismiss', 'Dismiss')} onDismiss={() => setSyncResult(null)}>
          {syncResult}
        </AdminNotice>
      )}

      {wrestlerRequests.length > 0 && (
        <AdminNotice tone="warning">
          {t('adminRoster.users.requestsPending', {
            defaultValue: '{{count}} wrestler request(s) pending approval',
            count: wrestlerRequests.length,
          })}
        </AdminNotice>
      )}

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
            onValueChange={(value) => setActiveFilter(value as FilterTab)}
            items={[
              { value: 'all', label: `${t('adminRoster.users.tabAll', 'All Users')} (${users.length})` },
              { value: 'wrestler-requests', label: `${t('adminRoster.users.tabRequests', 'Wrestler Requests')} (${wrestlerRequests.length})` },
              { value: 'wrestlers', label: t('adminRoster.users.tabWrestlers', 'Wrestlers') },
              { value: 'admins', label: t('adminRoster.users.tabAdmins', 'Admins') },
              { value: 'disabled', label: `${t('adminRoster.users.tabDisabled', 'Disabled')} (${disabledUsers.length})` },
            ]}
          />

          <DataTable
            className="ar-table users-table"
            caption={t('adminRoster.users.title', 'User Management')}
            density="dense"
            columns={columns}
            rows={filteredUsers}
            rowKey={(user) => user.username}
            empty={<EmptyState title={t('adminRoster.users.empty', 'No users found for this filter.')} />}
          />
        </>
      )}

      <Modal
        open={managedUser !== null}
        onClose={() => setManagedUsername(null)}
        title={managedUser?.email ?? t('adminRoster.users.manage', 'Manage')}
        description={t('adminRoster.users.manageHint', 'Change this account\'s roles and access.')}
      >
        {managedUser && (
          <div className="ar-form">
            <section className="ar-field" aria-label={t('adminRoster.users.roles', 'Roles')}>
              <span className="ar-field__label">{t('adminRoster.users.roles', 'Roles')}</span>
              <div className="user-manage-actions">
                {managedUser.wrestlerName && !managedUser.groups.includes('Wrestler')
                  && roleButton(managedUser, 'Wrestler', 'promote', t('adminRoster.users.approveWrestler', 'Approve Wrestler'))}
                {!managedUser.groups.includes('Wrestler') && !managedUser.wrestlerName
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
        open={pendingDelete !== null}
        title={t('adminRoster.users.deleteTitle', 'Delete user')}
        message={t('adminRoster.users.deleteConfirm', {
          defaultValue: 'Permanently delete user "{{username}}"? This cannot be undone.',
          username: pendingDelete ?? '',
        })}
        confirmLabel={t('common.delete', 'Delete')}
        busy={actionLoading !== null}
        onConfirm={handleDeleteUser}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
