import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Mic } from 'lucide-react';
import type { PromoWithContext, ReactionType } from '../../types/promo';
import { promosApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { usePromoReadState } from '../../hooks/usePromoReadState';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import PromoCard from './PromoCard';
import './PromoFeed.css';

type FeedFilter = 'all' | 'call-out' | 'championship' | 'match' | 'mentions';

const FILTER_TABS: { key: FeedFilter; labelKey: string; fallback: string }[] = [
  { key: 'all', labelKey: 'promos.feed.filterAll', fallback: 'All' },
  { key: 'call-out', labelKey: 'promos.feed.filterCallOuts', fallback: 'Call-Outs' },
  { key: 'championship', labelKey: 'promos.feed.filterChampionship', fallback: 'Championship' },
  { key: 'match', labelKey: 'promos.feed.filterMatch', fallback: 'Pre/Post Match' },
  { key: 'mentions', labelKey: 'promos.feed.filterMentions', fallback: 'Mentions' },
];

type DateGroup = 'today' | 'yesterday' | 'thisWeek' | 'older';

function getDateGroup(dateStr: string): DateGroup {
  const date = new Date(dateStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 6 * 86400000);

  if (date >= todayStart) return 'today';
  if (date >= yesterdayStart) return 'yesterday';
  if (date >= weekStart) return 'thisWeek';
  return 'older';
}

function matchesFilter(promo: PromoWithContext, filter: FeedFilter, currentPlayerId: string | null): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'call-out':
      return promo.promoType === 'call-out';
    case 'championship':
      return promo.promoType === 'championship';
    case 'match':
      return promo.promoType === 'pre-match' || promo.promoType === 'post-match';
    case 'mentions':
      return currentPlayerId !== null && promo.targetPlayerId === currentPlayerId;
    default:
      return true;
  }
}

export default function PromoFeed() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { playerId, isAdminOrModerator } = useAuth();
  const [activeFilter, setActiveFilter] = useState<FeedFilter>('all');
  const [hideRead, setHideRead] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [promos, setPromos] = useState<PromoWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { isRead, markAsRead, markAllAsRead, unreadCount } = usePromoReadState();

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        // The API leaves archived promos out unless staff ask for them.
        const filters = showArchived
          ? { excludeResponses: true, includeArchived: true }
          : { excludeResponses: true };
        const data = await promosApi.getAll(filters, controller.signal);
        if (controller.signal.aborted) return;
        setPromos(data);
        setError(null);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [showArchived, reloadKey]);

  const handleReact = useCallback(async (promoId: string, reaction: ReactionType) => {
    try {
      const result = await promosApi.react(promoId, reaction);
      setPromos((prev) =>
        prev.map((p) =>
          p.promoId === promoId
            ? { ...p, reactionCounts: result.reactionCounts }
            : p
        )
      );
    } catch { /* silent fail for reactions */ }
  }, []);

  const pinnedPromos = useMemo(
    () => promos.filter((p) => p.isPinned && !p.targetPromoId && p.promoType !== 'response'),
    [promos]
  );

  const mentionCount = useMemo(() => {
    if (!playerId) return 0;
    return promos.filter((p) => !p.isPinned && p.targetPlayerId === playerId && !isRead(p.promoId, p.createdAt)).length;
  }, [promos, playerId, isRead]);

  const filteredPromos = useMemo(() => {
    let result = promos.filter((p) => !p.isPinned && !p.targetPromoId && p.promoType !== 'response');
    if (activeFilter !== 'all') {
      result = result.filter((p) => matchesFilter(p, activeFilter, playerId));
    }
    if (hideRead) {
      result = result.filter((p) => !isRead(p.promoId, p.createdAt));
    }
    return result;
  }, [activeFilter, promos, playerId, hideRead, isRead]);

  const sortedPromos = useMemo(() => {
    return [...filteredPromos].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [filteredPromos]);

  const groupedPromos = useMemo(() => {
    const groups: { key: DateGroup; labelKey: string; promos: PromoWithContext[] }[] = [
      { key: 'today', labelKey: 'promos.feed.groupToday', promos: [] },
      { key: 'yesterday', labelKey: 'promos.feed.groupYesterday', promos: [] },
      { key: 'thisWeek', labelKey: 'promos.feed.groupThisWeek', promos: [] },
      { key: 'older', labelKey: 'promos.feed.groupOlder', promos: [] },
    ];
    for (const promo of sortedPromos) {
      const group = getDateGroup(promo.createdAt);
      const target = groups.find((g) => g.key === group);
      if (target) target.promos.push(promo);
    }
    return groups.filter((g) => g.promos.length > 0);
  }, [sortedPromos]);

  const unread = useMemo(() => unreadCount(promos), [unreadCount, promos]);
  const isFiltered = activeFilter !== 'all' || hideRead;

  const renderFeed = () => {
    if (loading) return <Skeleton variant="block" count={4} />;
    if (error) {
      return (
        <EmptyState
          title={t('promos.feed.loadError', 'Could not load promos')}
          description={error}
          actionLabel={t('common.retry', 'Retry')}
          onAction={() => setReloadKey((key) => key + 1)}
        />
      );
    }
    return (
      <>
        {pinnedPromos.length > 0 && activeFilter === 'all' && (
          <section className="promo-feed__group">
            <h2 className="promo-feed__group-title">{t('promos.feed.pinnedPromos', 'Pinned')}</h2>
            <div className="promo-feed__grid">
              {pinnedPromos.map((promo) => (
                <PromoCard key={promo.promoId} promo={promo} onReact={handleReact} />
              ))}
            </div>
          </section>
        )}

        {sortedPromos.length === 0 ? (
          <EmptyState
            icon={<Mic aria-hidden="true" />}
            title={isFiltered
              ? t('promos.feed.noFilterMatch', 'No promos match this filter.')
              : t('promos.feed.noPromos', 'No promos found. Be the first to cut a promo!')}
            actionLabel={isFiltered ? undefined : t('promos.feed.cutPromo', 'Cut a Promo')}
            onAction={isFiltered ? undefined : () => navigate('/promos/new')}
          />
        ) : (
          groupedPromos.map((group) => (
            <section key={group.key} className="promo-feed__group">
              <h2 className="promo-feed__group-title">{t(group.labelKey)}</h2>
              <div className="promo-feed__grid">
                {group.promos.map((promo) => (
                  <PromoCard
                    key={promo.promoId}
                    promo={promo}
                    isRead={isRead(promo.promoId, promo.createdAt)}
                    onView={() => markAsRead(promo.promoId)}
                    onReact={handleReact}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </>
    );
  };

  return (
    <div className="promo-feed">
      <PageHeader
        title={t('promos.feed.title', 'Wrestler Promos')}
        subtitle={unread > 0 ? `${unread} ${t('promos.feed.unread', 'unread')}` : undefined}
        actions={(
          <>
            {unread > 0 && (
              <Button variant="ghost" onClick={markAllAsRead}>
                {t('promos.feed.markAllRead', 'Mark all as read')}
              </Button>
            )}
            <Button to="/promos/new">{t('promos.feed.cutPromo', 'Cut a Promo')}</Button>
          </>
        )}
      />

      <div className="promo-feed__toolbar">
        <Tabs
          label={t('promos.feed.title', 'Wrestler Promos')}
          value={activeFilter}
          onValueChange={(value) => setActiveFilter(value as FeedFilter)}
          items={FILTER_TABS.map((tab) => ({
            value: tab.key,
            label: (
              <>
                {t(tab.labelKey, tab.fallback)}
                {tab.key === 'mentions' && mentionCount > 0 && (
                  <span className="promo-feed__tab-count">{mentionCount}</span>
                )}
              </>
            ),
          }))}
        />
        <div className="promo-feed__toggles">
          <label className="promo-feed__toggle">
            <input type="checkbox" checked={hideRead} onChange={(event) => setHideRead(event.target.checked)} />
            {t('promos.feed.hideRead', 'Hide Read')}
          </label>
          {isAdminOrModerator && (
            <label className="promo-feed__toggle">
              <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
              {t('promos.feed.showArchived', 'Show archived')}
            </label>
          )}
        </div>
      </div>

      {renderFeed()}
    </div>
  );
}
