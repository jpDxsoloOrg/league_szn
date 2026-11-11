import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Handshake, Medal, Mic, Swords, Trophy } from 'lucide-react';
import { activityApi } from '../services/api';
import type { ActivityItem, ActivityItemType } from '../types';
import Button from './ui/Button';
import Card from './ui/Card';
import EmptyState from './ui/EmptyState';
import PageHeader from './ui/PageHeader';
import Skeleton from './ui/Skeleton';
import Tabs from './ui/Tabs';
import './ActivityFeed.css';

const DEFAULT_LIMIT = 20;
const ALL_TYPES = 'all';

/** Backend expects type=match|championship|season|tournament|challenge|promo */
const TYPE_TO_PARAM: Record<ActivityItemType, string> = {
  match_result: 'match',
  championship_change: 'championship',
  season_event: 'season',
  tournament_result: 'tournament',
  challenge_event: 'challenge',
  promo_posted: 'promo',
};

const TYPE_FILTERS: { value: ActivityItemType | typeof ALL_TYPES; key: string }[] = [
  { value: ALL_TYPES, key: 'activity.filters.all' },
  { value: 'match_result', key: 'activity.types.match_result' },
  { value: 'championship_change', key: 'activity.types.championship_change' },
  { value: 'season_event', key: 'activity.types.season_event' },
  { value: 'tournament_result', key: 'activity.types.tournament_result' },
  { value: 'promo_posted', key: 'activity.types.promo_posted' },
];

const TYPE_ICONS: Record<ActivityItemType, ReactNode> = {
  match_result: <Swords aria-hidden="true" size={20} />,
  championship_change: <Trophy aria-hidden="true" size={20} />,
  season_event: <CalendarDays aria-hidden="true" size={20} />,
  tournament_result: <Medal aria-hidden="true" size={20} />,
  challenge_event: <Handshake aria-hidden="true" size={20} />,
  promo_posted: <Mic aria-hidden="true" size={20} />,
};

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
      // Challenge UI is hidden — route any historical challenge entries to the activity page itself.
      return '/activity';
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

export default function ActivityFeed() {
  const { t } = useTranslation();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Empty string means the request failed without a usable message.
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ActivityItemType | typeof ALL_TYPES>(ALL_TYPES);
  const activeRequest = useRef<AbortController | null>(null);

  const typeParam = typeFilter === ALL_TYPES ? undefined : TYPE_TO_PARAM[typeFilter];

  const fetchPage = useCallback(
    async (cursor?: string) => {
      // A response for an old filter must not land on the current list.
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;

      if (cursor) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await activityApi.getAll({ limit: DEFAULT_LIMIT, cursor, type: typeParam }, controller.signal);
        if (controller.signal.aborted) return;
        setItems((previous) => (cursor ? [...previous, ...res.items] : res.items));
        setNextCursor(res.nextCursor);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [typeParam]
  );

  useEffect(() => {
    void fetchPage();
    return () => activeRequest.current?.abort();
  }, [fetchPage]);

  const timeAgo = (timestamp: string) => {
    const { key, count } = formatRelativeTime(timestamp, new Date());
    return count != null ? t(key, { count }) : t(key);
  };

  const hasItems = items.length > 0;

  return (
    <div className="activity-feed">
      <PageHeader title={t('activity.title')} />

      <Tabs
        className="activity-feed__filters"
        label={t('activity.filters.label')}
        value={typeFilter}
        onValueChange={(value) => setTypeFilter(value as ActivityItemType | typeof ALL_TYPES)}
        items={TYPE_FILTERS.map(({ value, key }) => ({ value, label: t(key) }))}
      />

      {loading && <Skeleton variant="block" count={5} />}

      {!loading && error !== null && !hasItems && (
        <EmptyState
          title={t('activity.title')}
          description={error || undefined}
          actionLabel={t('common.retry')}
          onAction={() => void fetchPage()}
        />
      )}

      {!loading && error === null && !hasItems && (
        <EmptyState title={t('activity.title')} description={t('activity.noActivity')} />
      )}

      {!loading && hasItems && (
        <Card padding="none">
          <ul className="activity-feed__list">
            {items.map((item) => (
              <li key={item.id}>
                <Link to={getDetailLink(item)} className="activity-feed__row">
                  <span className="activity-feed__icon">{TYPE_ICONS[item.type]}</span>
                  <span className="activity-feed__body">
                    <span className="activity-feed__summary">{item.summary}</span>
                    <time
                      className="activity-feed__time"
                      dateTime={item.timestamp}
                      title={new Date(item.timestamp).toLocaleString()}
                    >
                      {timeAgo(item.timestamp)}
                    </time>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!loading && hasItems && error !== null && (
        <p className="activity-feed__error" role="alert">{error}</p>
      )}

      {!loading && hasItems && nextCursor && (
        <div className="activity-feed__load-more">
          <Button variant="secondary" loading={loadingMore} onClick={() => void fetchPage(nextCursor)}>
            {loadingMore ? t('activity.loading') : t('activity.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
