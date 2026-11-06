import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { factionsApi } from '../../services/api/factions.api';
import type { Stable, StableStatus } from '../../types/stable';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import type { DataTableColumn } from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import { useToast } from '../ui/toastContext';
import AdminNotice from './AdminNotice';
import ConfirmModal from './ConfirmModal';
import './adminRoster.css';

const ALL_STATUSES: StableStatus[] = ['pending', 'approved', 'active', 'disbanded'];

const STATUS_TONES: Record<StableStatus, BadgeTone> = {
  pending: 'warning',
  approved: 'primary',
  active: 'win',
  disbanded: 'draw',
};

const STATUS_DEFAULTS: Record<StableStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  active: 'Active',
  disbanded: 'Disbanded',
};

type PendingConfirm = { kind: 'delete' | 'reactivate'; faction: Stable };

export default function ManageFactions() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { isSuperAdmin } = useAuth();
  const [factions, setFactions] = useState<Stable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StableStatus | 'all'>('all');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const loadFactions = useCallback(async () => {
    try {
      setError(null);
      const data = await factionsApi.getAll();
      setFactions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.factions.loadError', 'Failed to load factions'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadFactions();
  }, [loadFactions]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return factions;
    return factions.filter((faction) => faction.status === statusFilter);
  }, [factions, statusFilter]);

  const statusLabel = (status: StableStatus) => t(`adminRoster.factions.status.${status}`, STATUS_DEFAULTS[status]);

  /** Runs one row action, then reports the outcome and reloads the list. */
  const runAction = async (faction: Stable, action: () => Promise<string>, failure: string) => {
    setSubmitting(faction.stableId);
    try {
      const message = await action();
      showToast(message, 'success');
      await loadFactions();
    } catch (err) {
      showToast(err instanceof Error ? err.message : failure, 'error');
    } finally {
      setSubmitting(null);
    }
  };

  const handleApprove = (faction: Stable) => runAction(faction, async () => {
    await factionsApi.approve(faction.stableId);
    return `${t('adminRoster.factions.approved', 'Approved')}: ${faction.name}`;
  }, t('adminRoster.factions.approveError', 'Failed to approve faction'));

  const handleReject = (faction: Stable) => runAction(faction, async () => {
    await factionsApi.reject(faction.stableId);
    return `${t('adminRoster.factions.rejected', 'Rejected')}: ${faction.name}`;
  }, t('adminRoster.factions.rejectError', 'Failed to reject faction'));

  const handleDisband = (faction: Stable) => runAction(faction, async () => {
    await factionsApi.disband(faction.stableId);
    return `${t('adminRoster.factions.disbanded', 'Disbanded')}: ${faction.name}`;
  }, t('adminRoster.factions.disbandError', 'Failed to disband faction'));

  const handleConfirm = async () => {
    if (!pendingConfirm) return;
    const { kind, faction } = pendingConfirm;
    if (kind === 'delete') {
      await runAction(faction, async () => {
        await factionsApi.delete(faction.stableId);
        return `${t('adminRoster.factions.deleted', 'Deleted')}: ${faction.name}`;
      }, t('adminRoster.factions.deleteError', 'Failed to delete faction'));
    } else {
      await runAction(faction, async () => {
        const result = await factionsApi.reactivate(faction.stableId);
        return t('adminRoster.factions.reactivated', {
          defaultValue: 'Reactivated: {{name}} ({{restored}} restored, {{skipped}} skipped)',
          name: faction.name,
          restored: result.restoredMemberIds.length,
          skipped: result.skippedMembers.length,
        });
      }, t('adminRoster.factions.reactivateError', 'Failed to reactivate faction'));
    }
    setPendingConfirm(null);
  };

  const columns: DataTableColumn<Stable>[] = [
    {
      key: 'name',
      header: t('adminRoster.factions.name', 'Name'),
      render: (faction) => <span className="ar-strong">{faction.name}</span>,
      sortValue: (faction) => faction.name,
    },
    {
      key: 'members',
      header: t('adminRoster.factions.members', 'Members'),
      render: (faction) => <span className="ar-numeric">{faction.memberIds.length}</span>,
      sortValue: (faction) => faction.memberIds.length,
    },
    {
      key: 'status',
      header: t('adminRoster.factions.statusColumn', 'Status'),
      render: (faction) => <Badge tone={STATUS_TONES[faction.status]}>{statusLabel(faction.status)}</Badge>,
      sortValue: (faction) => faction.status,
    },
    {
      key: 'record',
      header: t('adminRoster.factions.record', 'W/L/D'),
      render: (faction) => <span className="ar-numeric">{faction.wins}-{faction.losses}-{faction.draws}</span>,
      sortValue: (faction) => faction.wins,
    },
    {
      key: 'created',
      header: t('adminRoster.factions.created', 'Created'),
      hideOnMobile: true,
      render: (faction) => new Date(faction.createdAt).toLocaleDateString(),
      sortValue: (faction) => faction.createdAt,
    },
    {
      key: 'actions',
      header: t('common.actions', 'Actions'),
      align: 'end',
      render: (faction) => {
        const busy = submitting === faction.stableId;
        return (
          <div className="ar-row-actions">
            {faction.status === 'pending' && (
              <>
                <Button size="sm" disabled={busy} onClick={() => handleApprove(faction)}>
                  {t('adminRoster.factions.approve', 'Approve')}
                </Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => handleReject(faction)}>
                  {t('adminRoster.factions.reject', 'Reject')}
                </Button>
              </>
            )}
            {(faction.status === 'approved' || faction.status === 'active') && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => handleDisband(faction)}>
                {t('adminRoster.factions.disband', 'Disband')}
              </Button>
            )}
            {faction.status === 'disbanded' && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => setPendingConfirm({ kind: 'reactivate', faction })}>
                {t('adminRoster.factions.reactivate', 'Reactivate')}
              </Button>
            )}
            {isSuperAdmin && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPendingConfirm({ kind: 'delete', faction })}>
                {t('common.delete', 'Delete')}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const confirmName = pendingConfirm?.faction.name ?? '';

  return (
    <div className="ar-page admin-factions">
      <PageHeader title={t('adminRoster.factions.title', 'Manage Factions')} />

      {error ? (
        <>
          <AdminNotice tone="error">{error}</AdminNotice>
          <div><Button variant="secondary" onClick={loadFactions}>{t('common.retry', 'Retry')}</Button></div>
        </>
      ) : (
        <>
          <div className="ar-toolbar">
            <div className="ar-toolbar__filters">
              <Select
                label={t('adminRoster.factions.filterByStatus', 'Filter by status')}
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as StableStatus | 'all')}
                options={[
                  { value: 'all', label: t('common.all', 'All') },
                  ...ALL_STATUSES.map((status) => ({ value: status, label: statusLabel(status) })),
                ]}
              />
            </div>
            <span className="ar-count">
              {t('adminRoster.factions.count', { defaultValue: '{{count}} factions', count: filtered.length })}
            </span>
          </div>

          <DataTable
            className="ar-table"
            caption={t('adminRoster.factions.title', 'Manage Factions')}
            density="dense"
            columns={columns}
            rows={filtered}
            rowKey={(faction) => faction.stableId}
            loading={loading}
            empty={<EmptyState title={t('adminRoster.factions.empty', 'No factions found')} />}
          />
        </>
      )}

      <ConfirmModal
        open={pendingConfirm !== null}
        title={pendingConfirm?.kind === 'reactivate'
          ? t('adminRoster.factions.reactivateTitle', 'Reactivate faction')
          : t('adminRoster.factions.deleteTitle', 'Delete faction')}
        message={pendingConfirm?.kind === 'reactivate'
          ? t('factions.admin.confirmReactivate', {
            defaultValue: 'Reactivate "{{name}}"? Members who have since joined another faction will be skipped.',
            name: confirmName,
          })
          : t('adminRoster.factions.deleteConfirm', {
            defaultValue: 'Delete "{{name}}"? This cannot be undone.',
            name: confirmName,
          })}
        confirmLabel={pendingConfirm?.kind === 'reactivate'
          ? t('adminRoster.factions.reactivate', 'Reactivate')
          : t('common.delete', 'Delete')}
        busy={submitting !== null}
        onConfirm={handleConfirm}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}
