import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { activityApi } from '../services/api';
import type { ActivityItem, ActivityItemType } from '../types';
import './ActivityFeed.css';

const DEFAULT_LIMIT = 20;
/** Backend expects type=match|championship|season|tournament|challenge|promo */
const TYPE_TO_PARAM: Record<ActivityItemType, string> = {
  match_result: 'match',
  championship_change: 'championship',
  season_event: 'season',
  tournament_result: 'tournament',
  challenge_event: 'challenge',
  promo_posted: 'promo',
};

const TYPE_FILTERS: { value: '' | ActivityItemType; key: string }[] = [
  { value: '', key: 'activity.filters.all' },
  { value: 'match_result', key: 'activity.types.match_result' },
  { value: 'championship_change', key: 'activity.types.championship_change' },
  { value: 'season_event', key: 'activity.types.season_event' },
  { value: 'tournament_result', key: 'activity.types.tournament_result' },
  { value: 'challenge_event', key: 'activity.types.challenge_event' },
  { value: 'promo_posted', key: 'activity.types.promo_posted' },
];

function getDetailLink(item: ActivityItem): string {
  const meta = item.metadata;
  switch (item.type) {
    case 'match_result':
      return meta['eventId'] ? `/events/${meta['eventId']}` : '/events';
    case 'championship_change':
      return '/championships';
    case 'season_event':
      return meta['seasonId'] ? `/?seasonId=${meta['seasonId']}` : '/';
    case 'tournament_result':
      return '/tournaments';
    case 'challenge_event':
      return meta['challengeId'] ? `/challenges/${meta['challengeId']}` : '/challenges';
    case 'promo_posted':
      return meta['promoId'] ? `/promos/${meta['promoId']}` : '/promos';
    default:
      return '/';
  }
}

function formatRelativeTime(dateStr: string, now: Date): { key: string; count?: number } {
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return { key: 'activity.timeAgo.justNow' };
  if (diffMins < 60) return { key: 'activity.timeAgo.minutes', count: diffMins };
  if (diffHours < 24) return { key: 'activity.timeAgo.hours', count: diffHours };
  if (diffDays < 7) return { key: 'activity.timeAgo.days', count: diffDays };
  return { key: 'activity.timeAgo.date', count: diffDays };
}

const TYPE_ICONS: Record<ActivityItemType, string> = {
  match_result: '⚔️',
  championship_change: '🏆',
  season_event: '📅',
  tournament_result: '🏅',
  challenge_event: '🤝',
  promo_posted: '🎤',
};

export default function ActivityFeed() {
  const { t } = useTranslation();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'' | ActivityItemType>('');

  const typeParam =
    typeFilter && TYPE_TO_PARAM[typeFilter] ? TYPE_TO_PARAM[typeFilter] : undefined;

  const fetchPage = useCallback(
    async (cursor?: string, append = false) => {
      const isMore = !!cursor;
      if (isMore) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await activityApi.getAll(
          { limit: DEFAULT_LIMIT, cursor, type: typeParam }
        );
        if (append) {
          setItems((prev) => [...prev, ...res.items]);
        } else {
          setItems(res.items);
        }
        setNextCursor(res.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load activity');
      } finally {
        if (isMore) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [typeParam]
  );

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const handleLoadMore = useCallback(() => {
    if (nextCursor && !loadingMore) fetchPage(nextCursor, true);
  }, [nextCursor, loadingMore, fetchPage]);

  if (loading && items.length === 0) {
    return (
      <div className="activity-feed">
        <h1 className="activity-feed__title">{t('activity.title')}</h1>
        <p className="activity-feed__loading">{t('activity.loading')}</p>
      </div>
    );
  }

  const timeAgo = (timestamp: string) => {
    const { key, count } = formatRelativeTime(timestamp, new Date());
    return count != null ? t(key, { count }) : t(key);
  };

  return (
    <div className="activity-feed">
      <h1 className="activity-feed__title">{t('activity.title')}</h1>

      <div className="activity-feed__filters" role="tablist" aria-label={t('activity.filters.label')}>
        {TYPE_FILTERS.map(({ value, key }) => (
          <button
            key={value || 'all'}
            type="button"
            role="tab"
            aria-selected={typeFilter === value}
            className={`activity-feed__filter-tab ${typeFilter === value ? 'activity-feed__filter-tab--active' : ''}`}
            onClick={() => setTypeFilter(value)}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {error && (
        <div className="activity-feed__error">
          <p>{error}</p>
          <button type="button" onClick={() => fetchPage()}>
            {t('common.retry')}
          </button>
        </div>
      )}

      {!error && items.length === 0 && (
        <p className="activity-feed__empty">{t('activity.noActivity')}</p>
      )}

      {!error && items.length > 0 && (
        <ul className="activity-feed__list">
          {items.map((item) => (
            <li key={item.id} className={`activity-feed__card activity-feed__card--${item.type}`}>
              <Link to={getDetailLink(item)} className="activity-feed__card-link">
                <span className="activity-feed__card-icon" aria-hidden>
                  {TYPE_ICONS[item.type]}
                </span>
                <div className="activity-feed__card-body">
                  <p className="activity-feed__card-summary">{item.summary}</p>
                  <time
                    className="activity-feed__card-time"
                    dateTime={item.timestamp}
                    title={new Date(item.timestamp).toLocaleString()}
                  >
                    {timeAgo(item.timestamp)}
                  </time>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!error && nextCursor && items.length > 0 && (
        <div className="activity-feed__load-more">
          <button
            type="button"
            className="activity-feed__load-more-btn"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? t('activity.loading') : t('activity.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
}
