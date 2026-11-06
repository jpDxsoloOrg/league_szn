import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { statisticsApi } from '../../services/api';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import LeaderboardFilters from './LeaderboardFilters';
import RankedBoard from './RankedBoard';
import { useLeaderboardFilters } from './useLeaderboardFilters';
import { useStatsResource } from './useStatsResource';
import './stats-common.css';

type CategoryKey = 'mostWins' | 'bestWinPercentage' | 'longestStreak' | 'mostChampionships' | 'longestReign';

function Leaderboards() {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('mostWins');
  const filters = useLeaderboardFilters();
  const { seasonId } = filters;

  const loadBoards = useCallback(
    (signal: AbortSignal) => statisticsApi.getLeaderboards(seasonId || undefined, signal),
    [seasonId],
  );
  const { data, loading, failed, reload } = useStatsResource(loadBoards);

  const categories: { key: CategoryKey; label: string }[] = [
    { key: 'mostWins', label: t('statistics.leaderboards.categories.mostWins') },
    { key: 'bestWinPercentage', label: t('statistics.leaderboards.categories.winPercentage') },
    { key: 'longestStreak', label: t('statistics.leaderboards.categories.streaks') },
    { key: 'mostChampionships', label: t('statistics.leaderboards.categories.championships') },
    { key: 'longestReign', label: t('statistics.leaderboards.categories.longestReign') },
  ];

  const formatValue = (value: number): string => {
    if (activeCategory === 'bestWinPercentage') return `${value.toFixed(1)}%`;
    if (activeCategory === 'longestReign') return `${value} ${t('common.days')}`;
    return String(value);
  };

  const entries = (data?.leaderboards[activeCategory] ?? []).map((entry) => ({
    ...entry,
    value: formatValue(entry.value),
  }));
  const activeLabel = categories.find((category) => category.key === activeCategory)?.label ?? '';

  return (
    <div className="stats-page">
      <PageHeader
        className="stats-header--filters"
        eyebrow={t('nav.statistics')}
        title={t('statistics.leaderboards.title')}
        actions={<LeaderboardFilters filters={filters} />}
      />

      <Tabs
        label={t('statistics.leaderboards.title')}
        value={activeCategory}
        onValueChange={(value) => setActiveCategory(value as CategoryKey)}
        items={categories.map((category) => ({ value: category.key, label: category.label }))}
      />

      {failed ? (
        <EmptyState title={t('statistics.loadFailed')} actionLabel={t('common.retry')} onAction={reload} />
      ) : loading ? (
        <Skeleton variant="table" count={8} />
      ) : entries.length === 0 ? (
        <EmptyState title={activeLabel} description={t('statistics.leaderboards.noData')} />
      ) : (
        <RankedBoard entries={entries} label={activeLabel} />
      )}
    </div>
  );
}

export default Leaderboards;
