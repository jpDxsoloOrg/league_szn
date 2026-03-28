import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PromoType } from '../../types/promo';
import { PromoWithContext } from '../../types/promo';
import { promosApi } from '../../services/api';
import { usePromoReadState } from '../../hooks/usePromoReadState';
import PromoCard from './PromoCard';
import './PromoFeed.css';

type FeedFilter = 'all' | 'call-out' | 'response' | 'championship' | 'match';

const FILTER_TABS: { key: FeedFilter; labelKey: string; fallback: string }[] = [
  { key: 'all', labelKey: 'promos.feed.filterAll', fallback: 'All' },
  { key: 'call-out', labelKey: 'promos.feed.filterCallOuts', fallback: 'Call-Outs' },
  { key: 'response', labelKey: 'promos.feed.filterResponses', fallback: 'Responses' },
  { key: 'championship', labelKey: 'promos.feed.filterChampionship', fallback: 'Championship' },
  { key: 'match', labelKey: 'promos.feed.filterMatch', fallback: 'Pre/Post Match' },
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

function matchesFilter(promoType: PromoType, filter: FeedFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'call-out':
      return promoType === 'call-out';
    case 'response':
      return promoType === 'response';
    case 'championship':
      return promoType === 'championship';
    case 'match':
      return promoType === 'pre-match' || promoType === 'post-match';
    default:
      return true;
  }
}

export default function PromoFeed() {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<FeedFilter>('all');
  const [promos, setPromos] = useState<PromoWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isRead, markAsRead, markAllAsRead, unreadCount } = usePromoReadState();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    promosApi
      .getAll(undefined, controller.signal)
      .then((data) => {
        setPromos(data);
        setError(null);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const handleReact = useCallback(async (promoId: string, reaction: import('../../types/promo').ReactionType) => {
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

  const pinnedPromos = useMemo(() => promos.filter((p) => p.isPinned), [promos]);

  const filteredPromos = useMemo(() => {
    const nonPinned = promos.filter((p) => !p.isPinned);
    if (activeFilter === 'all') return nonPinned;
    return nonPinned.filter((p) => matchesFilter(p.promoType, activeFilter));
  }, [activeFilter, promos]);

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

  if (loading) {
    return (
      <div className="promo-feed">
        <div className="promo-feed-header">
          <h2>{t('promos.feed.title', 'Wrestler Promos')}</h2>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Loading promos...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="promo-feed">
        <div className="promo-feed-header">
          <h2>{t('promos.feed.title', 'Wrestler Promos')}</h2>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem', color: '#ef4444' }}>Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="promo-feed">
      <div className="promo-feed-header">
        <h2>{t('promos.feed.title', 'Wrestler Promos')}</h2>
        <div className="promo-feed-header-actions">
          {unread > 0 && (
            <span className="promo-unread-badge">
              {unread} {t('promos.feed.unread', 'unread')}
            </span>
          )}
          {unread > 0 && (
            <button className="mark-all-read-btn" onClick={markAllAsRead}>
              {t('promos.feed.markAllRead', 'Mark all as read')}
            </button>
          )}
          <Link to="/promos/new" className="cut-promo-btn">
            {t('promos.feed.cutPromo', 'Cut a Promo')}
          </Link>
        </div>
      </div>

      <div className="promo-feed-filters">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            className={`filter-tab ${activeFilter === tab.key ? 'active' : ''}`}
            onClick={() => setActiveFilter(tab.key)}
          >
            {t(tab.labelKey, tab.fallback)}
          </button>
        ))}
      </div>

      {pinnedPromos.length > 0 && activeFilter === 'all' && (
        <div className="promo-pinned-section">
          <h3 className="promo-section-title">
            {t('promos.feed.pinnedPromos', 'Pinned')}
          </h3>
          {pinnedPromos.map((promo) => (
            <PromoCard key={promo.promoId} promo={promo} onReact={handleReact} />
          ))}
        </div>
      )}

      <div className="promo-list">
        {sortedPromos.length === 0 ? (
          <div className="promo-empty-state">
            <p>{t('promos.feed.noPromos', 'No promos found. Be the first to cut a promo!')}</p>
            <Link to="/promos/new" className="cut-promo-btn secondary">
              {t('promos.feed.cutPromo', 'Cut a Promo')}
            </Link>
          </div>
        ) : (
          groupedPromos.map((group) => (
            <div key={group.key} className="promo-date-group">
              <h3 className="promo-date-group-title">{t(group.labelKey)}</h3>
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
          ))
        )}
      </div>
    </div>
  );
}
