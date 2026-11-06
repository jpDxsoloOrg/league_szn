import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { statisticsApi, playersApi } from '../../services/api';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import { StarRating } from '../matches/StarRating';
import { formatCalendarDate } from '../../utils/dateUtils';
import { useStatsResource } from './useStatsResource';
import './stats-common.css';
import './BestMatches.css';

export default function BestMatches() {
  const { t } = useTranslation();

  const loadMatches = useCallback(async (signal: AbortSignal) => {
    const [ratings, directory] = await Promise.all([
      statisticsApi.getMatchRatings(signal),
      playersApi.getDirectory(signal),
    ]);
    return { matches: ratings.highestRatedMatches, directory };
  }, []);
  const { data, loading, failed, reload } = useStatsResource(loadMatches);

  const title = t('statistics.bestMatches.title');
  const matches = data?.matches ?? [];

  const participantName = (playerId: string): string => {
    const player = data?.directory.find((entry) => entry.playerId === playerId);
    return player?.currentWrestler ?? player?.name ?? t('statistics.bestMatches.unknownPlayer');
  };

  const renderBody = () => {
    if (loading) return <Skeleton variant="block" count={5} />;
    if (failed) {
      return <EmptyState title={t('statistics.loadFailed')} actionLabel={t('common.retry')} onAction={reload} />;
    }
    if (matches.length === 0) {
      return <EmptyState title={title} description={t('statistics.bestMatches.noData')} />;
    }
    return (
      <ol className="stats-rows">
        {matches.map((match) => (
          <li key={match.matchId} className="best-match">
            <div className="stats-row__main">
              <span className="stats-row__title">
                {match.participants.map(participantName).join(` ${t('common.vs')} `)}
              </span>
              <span className="stats-row__detail">{formatCalendarDate(match.date)}</span>
            </div>
            <div className="best-match-awards">
              {match.matchOfTheNight && <Badge tone="pink">{t('match.matchOfTheNightBadge')}</Badge>}
              <StarRating starRating={match.starRating} ratingsCount={match.ratingsCount ?? 1} size="sm" />
            </div>
          </li>
        ))}
      </ol>
    );
  };

  return (
    <div className="stats-page">
      <PageHeader eyebrow={t('nav.statistics')} title={title} />
      {renderBody()}
    </div>
  );
}
