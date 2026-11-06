import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { factionsApi } from '../../services/api';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { logger } from '../../utils/logger';
import type { StableStanding } from '../../types/stable';
import Avatar from '../ui/Avatar';
import DataTable from '../ui/DataTable';
import type { DataTableColumn } from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Podium from '../ui/Podium';
import Skeleton from '../ui/Skeleton';
import FactionsHubTabs from './FactionsHubTabs';
import GroupFormCell from './GroupFormCell';
import { formatRecord } from './factionFormat';
import '../rankPodium.css';
import './groupUi.css';

const PODIUM_SIZE = 3;

interface RankedStanding extends StableStanding {
  rank: number;
}

export default function FactionStandings() {
  const { t } = useTranslation();
  useDocumentTitle(t('factions.standings', 'Faction Standings'));
  const [standings, setStandings] = useState<StableStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchStandings = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await factionsApi.getStandings(abortController.signal);
        if (!abortController.signal.aborted) setStandings(data);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Failed to load faction standings');
          setError(err.message || 'Failed to load faction standings');
        }
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    };

    fetchStandings();
    return () => abortController.abort();
  }, [reloadKey]);

  const ranked: RankedStanding[] = standings.map((standing, index) => ({ ...standing, rank: index + 1 }));
  const showPodium = ranked.length >= PODIUM_SIZE;
  const tableRows = showPodium ? ranked.slice(PODIUM_SIZE) : ranked;

  const columns: DataTableColumn<RankedStanding>[] = [
    { key: 'rank', header: t('standings.table.rank', 'Rank'), render: (row) => row.rank, sortValue: (row) => row.rank },
    {
      key: 'name',
      header: t('factions.name', 'Name'),
      render: (row) => (
        <Link to={`/factions/${row.stableId}`} className="group-table-name">
          <Avatar src={row.imageUrl} name={row.name} size="sm" />
          {row.name}
        </Link>
      ),
      sortValue: (row) => row.name,
    },
    {
      key: 'members',
      header: t('factions.detailTabs.members', 'Members'),
      render: (row) => row.memberCount,
      sortValue: (row) => row.memberCount,
      align: 'end',
      hideOnMobile: true,
    },
    {
      key: 'record',
      header: t('factions.redesign.recordColumn', 'W-L-D'),
      render: (row) => formatRecord(row.wins, row.losses, row.draws),
      sortValue: (row) => row.wins,
      align: 'end',
    },
    {
      key: 'winRate',
      header: t('standings.table.winPercent', 'Win%'),
      render: (row) => `${row.winPercentage.toFixed(1)}%`,
      sortValue: (row) => row.winPercentage,
      align: 'end',
    },
    {
      key: 'form',
      header: t('standings.table.form', 'Form'),
      render: (row) => <GroupFormCell recentForm={row.recentForm} currentStreak={row.currentStreak} />,
    },
  ];

  const renderBody = () => {
    if (loading) return <Skeleton variant="table" count={6} />;
    if (error) {
      return (
        <EmptyState
          title={t('common.error', 'Error')}
          description={error}
          actionLabel={t('common.retry', 'Retry')}
          onAction={() => setReloadKey((key) => key + 1)}
        />
      );
    }
    if (standings.length === 0) {
      return (
        <EmptyState
          title={t('factions.standings', 'Faction Standings')}
          description={t('factions.noStandings', 'No faction standings data yet.')}
        />
      );
    }
    return (
      <>
        {showPodium && (
          <Podium
            className="rank-podium"
            label={t('factions.standings', 'Faction Standings')}
            entries={ranked.slice(0, PODIUM_SIZE).map((row) => ({
              id: row.stableId,
              name: row.name,
              imageUrl: row.imageUrl,
              record: formatRecord(row.wins, row.losses, row.draws),
              to: `/factions/${row.stableId}`,
              stats: [
                { label: t('standings.table.winPercent', 'Win%'), value: `${row.winPercentage.toFixed(1)}%` },
                { label: t('factions.detailTabs.members', 'Members'), value: row.memberCount },
              ],
            }))}
          />
        )}
        {tableRows.length > 0 && (
          <DataTable
            caption={t('factions.standings', 'Faction Standings')}
            columns={columns}
            rows={tableRows}
            rowKey={(row) => row.stableId}
          />
        )}
      </>
    );
  };

  return (
    <div className="group-page">
      <PageHeader title={t('factions.title', 'Factions')} />
      <FactionsHubTabs />
      {renderBody()}
    </div>
  );
}
