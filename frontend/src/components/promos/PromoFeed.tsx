import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PromoType } from '../../types/promo';
import { mockPromos, getPinnedPromos, getVisiblePromos } from '../../mocks/promoMockData';
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

  const pinnedPromos = useMemo(() => getPinnedPromos(), []);
  const visiblePromos = useMemo(() => getVisiblePromos(), []);

  const filteredPromos = useMemo(() => {
    const nonPinned = visiblePromos.filter((p) => !p.isPinned);
    if (activeFilter === 'all') return nonPinned;
    return nonPinned.filter((p) => matchesFilter(p.promoType, activeFilter));
  }, [activeFilter, visiblePromos]);

  const sortedPromos = useMemo(() => {
    return [...filteredPromos].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [filteredPromos]);

  return (
    <div className="promo-feed">
      <div className="promo-feed-header">
        <h2>{t('promos.feed.title', 'Wrestler Promos')}</h2>
        <Link to="/promos/new" className="cut-promo-btn">
          {t('promos.feed.cutPromo', 'Cut a Promo')}
        </Link>
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
            <PromoCard key={promo.promoId} promo={promo} />
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
          sortedPromos.map((promo) => (
            <PromoCard key={promo.promoId} promo={promo} />
          ))
        )}
      </div>
    </div>
  );
}
