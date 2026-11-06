import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { statisticsApi } from '../../services/api';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import { useStatsResource } from './useStatsResource';
import './stats-common.css';
import './Achievements.css';

type FilterType = 'all' | 'milestone' | 'record' | 'special';

function Achievements() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const loadCatalog = useCallback((signal: AbortSignal) => statisticsApi.getAchievements(undefined, signal), []);
  const catalog = useStatsResource(loadCatalog);
  const players = catalog.data?.players ?? [];

  const requestedPlayerId = searchParams.get('player') ?? '';
  const selectedPlayerId = players.some((player) => player.playerId === requestedPlayerId)
    ? requestedPlayerId
    : players[0]?.playerId ?? '';

  const loadEarned = useCallback(async (signal: AbortSignal) => {
    if (!selectedPlayerId) return [];
    return (await statisticsApi.getAchievements(selectedPlayerId, signal)).achievements ?? [];
  }, [selectedPlayerId]);
  const earned = useStatsResource(loadEarned);

  const earnedIds = useMemo(
    () => new Set((earned.data ?? []).map((achievement) => achievement.achievementId)),
    [earned.data],
  );

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: t('statistics.achievements.filters.all') },
    { key: 'milestone', label: t('statistics.achievements.filters.milestones') },
    { key: 'record', label: t('statistics.achievements.filters.records') },
    { key: 'special', label: t('statistics.achievements.filters.special') },
  ];

  const title = t('statistics.achievements.title');
  const shownAchievements = (catalog.data?.allAchievements ?? []).filter(
    (achievement) => activeFilter === 'all' || achievement.achievementType === activeFilter,
  );
  const earnedCount = shownAchievements.filter((achievement) => earnedIds.has(achievement.achievementId)).length;

  const renderBody = () => {
    if (catalog.loading) return <Skeleton variant="block" count={4} />;
    if (catalog.failed) {
      return <EmptyState title={t('statistics.loadFailed')} actionLabel={t('common.retry')} onAction={catalog.reload} />;
    }
    if (players.length === 0) {
      return <EmptyState title={title} description={t('statistics.achievements.noPlayers')} />;
    }
    return (
      <>
        <Tabs
          label={title}
          value={activeFilter}
          onValueChange={(value) => setActiveFilter(value as FilterType)}
          items={filters.map((filter) => ({ value: filter.key, label: filter.label }))}
        />

        {earned.failed ? (
          <EmptyState title={t('statistics.loadFailed')} actionLabel={t('common.retry')} onAction={earned.reload} />
        ) : earned.loading ? (
          <Skeleton variant="block" count={4} />
        ) : shownAchievements.length === 0 ? (
          <EmptyState title={title} description={t('statistics.achievements.noAchievements')} />
        ) : (
          <>
            <div className="ach-summary">
              <span className="ach-summary-count">
                {earnedCount}/{shownAchievements.length} {t('statistics.achievements.earned')}
              </span>
              <progress className="stats-bar" value={earnedCount} max={Math.max(shownAchievements.length, 1)} aria-hidden="true" />
            </div>

            <ul className="ach-grid">
              {shownAchievements.map((achievement) => {
                const isEarned = earnedIds.has(achievement.achievementId);
                return (
                  <li key={achievement.achievementId} className={`ach-card ${isEarned ? 'ach-card-earned' : 'ach-card-locked'}`}>
                    <span className="ach-icon" aria-hidden="true">{achievement.icon}</span>
                    <div className="stats-row__main">
                      <span className="stats-row__title">{achievement.achievementName}</span>
                      <span className="stats-row__detail">{achievement.description}</span>
                    </div>
                    {isEarned
                      ? <Badge tone="win">{t('statistics.achievements.earned')}</Badge>
                      : <Badge tone="neutral">{t('statistics.achievements.locked')}</Badge>}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </>
    );
  };

  return (
    <div className="stats-page">
      <PageHeader
        eyebrow={t('nav.statistics')}
        title={title}
        actions={players.length > 0 ? (
          <Select
            label={t('statistics.playerStats.selectPlayer')}
            value={selectedPlayerId}
            onValueChange={(player) => setSearchParams({ player }, { replace: true })}
            options={players.map((player) => ({ value: player.playerId, label: `${player.name} (${player.wrestlerName})` }))}
          />
        ) : undefined}
      />
      {renderBody()}
    </div>
  );
}

export default Achievements;
