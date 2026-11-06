import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { tagTeamsApi } from '../../services/api/tagTeams.api';
import { playersApi } from '../../services/api';
import type { Player } from '../../types';
import type { TagTeam, TagTeamStatus } from '../../types/tagTeam';
import { isNeedsWrestler } from '../../utils/needsWrestler';
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
import HiddenBadge from './HiddenBadge';
import './adminRoster.css';

const ALL_STATUSES: TagTeamStatus[] = ['pending_partner', 'pending_admin', 'active', 'dissolved'];

const STATUS_TONES: Record<TagTeamStatus, BadgeTone> = {
  pending_partner: 'neutral',
  pending_admin: 'warning',
  active: 'win',
  dissolved: 'draw',
};

const STATUS_DEFAULTS: Record<TagTeamStatus, string> = {
  pending_partner: 'Pending Partner',
  pending_admin: 'Pending Admin',
  active: 'Active',
  dissolved: 'Dissolved',
};

export default function ManageTagTeams() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [tagTeams, setTagTeams] = useState<TagTeam[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TagTeamStatus | 'all'>('all');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TagTeam | null>(null);

  const loadTagTeams = useCallback(async () => {
    try {
      setError(null);
      const [data, playersData] = await Promise.all([
        tagTeamsApi.getAll(),
        playersApi.getAllIncludingHidden(),
      ]);
      setTagTeams(data);
      setPlayers(playersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.tagTeams.loadError', 'Failed to load tag teams'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadTagTeams();
  }, [loadTagTeams]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return tagTeams;
    return tagTeams.filter((tagTeam) => tagTeam.status === statusFilter);
  }, [tagTeams, statusFilter]);

  const statusLabel = (status: TagTeamStatus) => t(`adminRoster.tagTeams.status.${status}`, STATUS_DEFAULTS[status]);

  /** Runs one row action, then reports the outcome and reloads the list. */
  const runAction = async (tagTeam: TagTeam, action: () => Promise<unknown>, doneLabel: string, failure: string) => {
    setSubmitting(tagTeam.tagTeamId);
    try {
      await action();
      showToast(`${doneLabel}: ${tagTeam.name}`, 'success');
      await loadTagTeams();
    } catch (err) {
      showToast(err instanceof Error ? err.message : failure, 'error');
    } finally {
      setSubmitting(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const tagTeam = pendingDelete;
    await runAction(
      tagTeam,
      () => tagTeamsApi.delete(tagTeam.tagTeamId),
      t('adminRoster.tagTeams.deleted', 'Deleted'),
      t('adminRoster.tagTeams.deleteError', 'Failed to delete tag team'),
    );
    setPendingDelete(null);
  };

  const renderPlayer = (playerId: string) => {
    const player = players.find((candidate) => candidate.playerId === playerId);
    if (!player) return <span className="ar-sub">{t('common.unknown', 'Unknown')}</span>;
    const details = [isNeedsWrestler(player.currentWrestler) ? '' : player.currentWrestler, player.psnId]
      .filter(Boolean)
      .join(' / ');
    return (
      <span className="ar-stack">
        <span>{player.name}</span>
        {details && <span className="ar-sub">{details}</span>}
        {isNeedsWrestler(player.currentWrestler) && <HiddenBadge />}
      </span>
    );
  };

  const columns: DataTableColumn<TagTeam>[] = [
    {
      key: 'name',
      header: t('adminRoster.tagTeams.name', 'Name'),
      render: (tagTeam) => <span className="ar-strong">{tagTeam.name}</span>,
      sortValue: (tagTeam) => tagTeam.name,
    },
    { key: 'player1', header: t('adminRoster.tagTeams.player1', 'Player 1'), render: (tagTeam) => renderPlayer(tagTeam.player1Id) },
    { key: 'player2', header: t('adminRoster.tagTeams.player2', 'Player 2'), render: (tagTeam) => renderPlayer(tagTeam.player2Id) },
    {
      key: 'status',
      header: t('adminRoster.tagTeams.statusColumn', 'Status'),
      render: (tagTeam) => <Badge tone={STATUS_TONES[tagTeam.status]}>{statusLabel(tagTeam.status)}</Badge>,
      sortValue: (tagTeam) => tagTeam.status,
    },
    {
      key: 'record',
      header: t('adminRoster.tagTeams.record', 'W/L/D'),
      render: (tagTeam) => <span className="ar-numeric">{tagTeam.wins}-{tagTeam.losses}-{tagTeam.draws}</span>,
      sortValue: (tagTeam) => tagTeam.wins,
    },
    {
      key: 'created',
      header: t('adminRoster.tagTeams.created', 'Created'),
      hideOnMobile: true,
      render: (tagTeam) => new Date(tagTeam.createdAt).toLocaleDateString(),
      sortValue: (tagTeam) => tagTeam.createdAt,
    },
    {
      key: 'actions',
      header: t('common.actions', 'Actions'),
      align: 'end',
      render: (tagTeam) => {
        const busy = submitting === tagTeam.tagTeamId;
        return (
          <div className="ar-row-actions">
            {tagTeam.status === 'pending_admin' && (
              <>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => runAction(
                    tagTeam,
                    () => tagTeamsApi.approve(tagTeam.tagTeamId),
                    t('adminRoster.tagTeams.approved', 'Approved'),
                    t('adminRoster.tagTeams.approveError', 'Failed to approve tag team'),
                  )}
                >
                  {t('adminRoster.tagTeams.approve', 'Approve')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => runAction(
                    tagTeam,
                    () => tagTeamsApi.reject(tagTeam.tagTeamId),
                    t('adminRoster.tagTeams.rejected', 'Rejected'),
                    t('adminRoster.tagTeams.rejectError', 'Failed to reject tag team'),
                  )}
                >
                  {t('adminRoster.tagTeams.reject', 'Reject')}
                </Button>
              </>
            )}
            {tagTeam.status === 'active' && (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => runAction(
                  tagTeam,
                  () => tagTeamsApi.dissolve(tagTeam.tagTeamId),
                  t('adminRoster.tagTeams.dissolved', 'Dissolved'),
                  t('adminRoster.tagTeams.dissolveError', 'Failed to dissolve tag team'),
                )}
              >
                {t('adminRoster.tagTeams.dissolve', 'Dissolve')}
              </Button>
            )}
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPendingDelete(tagTeam)}>
              {t('common.delete', 'Delete')}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="ar-page admin-tagteams">
      <PageHeader title={t('adminRoster.tagTeams.title', 'Manage Tag Teams')} />

      {error ? (
        <>
          <AdminNotice tone="error">{error}</AdminNotice>
          <div><Button variant="secondary" onClick={loadTagTeams}>{t('common.retry', 'Retry')}</Button></div>
        </>
      ) : (
        <>
          <div className="ar-toolbar">
            <div className="ar-toolbar__filters">
              <Select
                label={t('adminRoster.tagTeams.filterByStatus', 'Filter by status')}
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as TagTeamStatus | 'all')}
                options={[
                  { value: 'all', label: t('common.all', 'All') },
                  ...ALL_STATUSES.map((status) => ({ value: status, label: statusLabel(status) })),
                ]}
              />
            </div>
            <span className="ar-count">
              {t('adminRoster.tagTeams.count', { defaultValue: '{{count}} tag teams', count: filtered.length })}
            </span>
          </div>

          <DataTable
            className="ar-table"
            caption={t('adminRoster.tagTeams.title', 'Manage Tag Teams')}
            density="dense"
            columns={columns}
            rows={filtered}
            rowKey={(tagTeam) => tagTeam.tagTeamId}
            loading={loading}
            empty={<EmptyState title={t('adminRoster.tagTeams.empty', 'No tag teams found')} />}
          />
        </>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        title={t('adminRoster.tagTeams.deleteTitle', 'Delete tag team')}
        message={t('adminRoster.tagTeams.deleteConfirm', {
          defaultValue: 'Delete "{{name}}"? This cannot be undone.',
          name: pendingDelete?.name ?? '',
        })}
        confirmLabel={t('common.delete', 'Delete')}
        busy={submitting !== null}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
