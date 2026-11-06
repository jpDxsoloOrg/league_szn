import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { overallsApi } from '../../services/api';
import type { WrestlerOverallWithPlayer } from '../../types';
import DataTable from '../ui/DataTable';
import type { DataTableColumn } from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Badge from '../ui/Badge';
import AdminNotice from './AdminNotice';
import './adminRoster.css';

export default function ManageOveralls() {
  const { t } = useTranslation();
  const [overalls, setOveralls] = useState<WrestlerOverallWithPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOveralls();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const loadOveralls = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await overallsApi.getAllOveralls();
      setOveralls(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.overalls.loadError', 'Failed to load overalls'));
    } finally {
      setLoading(false);
    }
  };

  const columns: DataTableColumn<WrestlerOverallWithPlayer>[] = [
    {
      key: 'player',
      header: t('overalls.admin.player'),
      render: (entry) => <span className="ar-strong">{entry.playerName}</span>,
      sortValue: (entry) => entry.playerName,
    },
    {
      key: 'wrestler',
      header: t('overalls.admin.wrestler'),
      render: (entry) => entry.wrestlerName,
      sortValue: (entry) => entry.wrestlerName,
    },
    {
      key: 'main',
      header: t('overalls.admin.mainOverall'),
      align: 'end',
      render: (entry) => <Badge tone="primary">{entry.mainOverall}</Badge>,
      sortValue: (entry) => entry.mainOverall,
    },
    {
      key: 'alternate',
      header: t('overalls.admin.altOverall'),
      align: 'end',
      render: (entry) => (entry.alternateOverall !== undefined ? <Badge>{entry.alternateOverall}</Badge> : '—'),
      sortValue: (entry) => entry.alternateOverall ?? -1,
    },
    {
      key: 'submitted',
      header: t('overalls.admin.submittedAt'),
      render: (entry) => new Date(entry.submittedAt).toLocaleDateString(),
      sortValue: (entry) => entry.submittedAt,
    },
  ];

  return (
    <div className="ar-page manage-overalls">
      <PageHeader title={t('overalls.admin.title')} subtitle={t('overalls.admin.subtitle')} />
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      <DataTable
        caption={t('overalls.admin.title')}
        density="dense"
        columns={columns}
        rows={overalls}
        rowKey={(entry) => entry.playerId}
        loading={loading}
        empty={<EmptyState title={t('overalls.admin.noData')} />}
      />
    </div>
  );
}
