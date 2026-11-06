import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { statisticsApi } from '../../services/api';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import LeaderboardFilters from './LeaderboardFilters';
import RankedBoard from './RankedBoard';
import { useLeaderboardFilters } from './useLeaderboardFilters';
import { useStatsResource } from './useStatsResource';
import './stats-common.css';

function MatchTypeLeaderboards() {
  const { t } = useTranslation();
  const filters = useLeaderboardFilters();
  const { seasonId, matchTypeId, stipulationId } = filters;

  const loadBoard = useCallback(
    (signal: AbortSignal) => statisticsApi.getMatchTypeLeaderboards(
      {
        seasonId: seasonId || undefined,
        matchTypeId: matchTypeId || undefined,
        stipulationId: stipulationId || undefined,
      },
      signal,
    ),
    [seasonId, matchTypeId, stipulationId],
  );
  const { data, loading, failed, reload } = useStatsResource(loadBoard);

  const title = t('statistics.matchTypeLeaderboards.title');
  const entries = (data?.leaderboard ?? []).map((entry) => ({
    playerId: entry.playerId,
    playerName: entry.playerName,
    wrestlerName: entry.wrestlerName,
    rank: entry.rank,
    value: `${entry.winPercentage.toFixed(1)}%`,
    detail: `${entry.wins}-${entry.losses}-${entry.draws}`,
  }));

  return (
    <div className="stats-page">
      <PageHeader
        eyebrow={t('statistics.leaderboards.title')}
        title={title}
        actions={<LeaderboardFilters filters={filters} />}
      />

      {failed ? (
        <EmptyState title={t('statistics.loadFailed')} actionLabel={t('common.retry')} onAction={reload} />
      ) : loading ? (
        <Skeleton variant="table" count={8} />
      ) : entries.length === 0 ? (
        <EmptyState title={title} description={t('statistics.matchTypeLeaderboards.noData')} />
      ) : (
        <RankedBoard entries={entries} label={title} />
      )}
    </div>
  );
}

export default MatchTypeLeaderboards;
