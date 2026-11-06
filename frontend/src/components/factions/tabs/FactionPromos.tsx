import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useOutletContext } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { factionsApi } from '../../../services/api';
import { logger } from '../../../utils/logger';
import type {
  FactionPromoFilter,
  FactionPromoRow,
} from '../../../types/faction';
import type { FactionDetailContext } from '../FactionDetail';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import EmptyState from '../../ui/EmptyState';
import Select from '../../ui/Select';
import Skeleton from '../../ui/Skeleton';
import Tabs from '../../ui/Tabs';
import '../groupUi.css';
import './FactionPromos.css';

type SortKey = 'newest' | 'viewed' | 'heat';

const PAGE_LIMIT = 30;

const FILTER_OPTIONS: ReadonlyArray<{
  value: FactionPromoFilter;
  i18nKey: string;
  fallback: string;
}> = [
  { value: 'all', i18nKey: 'factions.promos.filterAll', fallback: 'ALL' },
  { value: 'by-faction', i18nKey: 'factions.promos.filterBy', fallback: 'BY THIS FACTION' },
  { value: 'directed-at-faction', i18nKey: 'factions.promos.filterDirected', fallback: 'DIRECTED AT US' },
  { value: 'featuring-faction', i18nKey: 'factions.promos.filterFeaturing', fallback: 'FEATURING US' },
];

function sortPromos(items: FactionPromoRow[], by: SortKey): FactionPromoRow[] {
  const copy = [...items];
  switch (by) {
    case 'viewed':
      return copy.sort(
        (a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0) || b.date.localeCompare(a.date),
      );
    case 'heat':
      return copy.sort(
        (a, b) => (b.heatImpact ?? 0) - (a.heatImpact ?? 0) || b.date.localeCompare(a.date),
      );
    case 'newest':
    default:
      return copy.sort((a, b) => b.date.localeCompare(a.date));
  }
}

export default function FactionPromos() {
  const { t } = useTranslation();
  const { faction } = useOutletContext<FactionDetailContext>();

  const [filter, setFilter] = useState<FactionPromoFilter>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [items, setItems] = useState<FactionPromoRow[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hide sort options whose data the backend doesn't actually surface yet.
  // FAC-08 returns viewCount/heatImpact as null placeholders, so we only
  // expose those options if any loaded item has the value populated.
  const hasViewCounts = items.some((p) => p.viewCount !== null && p.viewCount !== undefined);
  const hasHeatImpacts = items.some((p) => p.heatImpact !== null && p.heatImpact !== undefined);

  // Initial / filter-change fetch — reset list, cursor, loading state.
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setItems([]);
    setCursor(undefined);

    const loadPromos = async () => {
      try {
        const response = await factionsApi.getPromos(faction.stableId, { filter, limit: PAGE_LIMIT }, ac.signal);
        if (!ac.signal.aborted) {
          setItems(response.items);
          setCursor(response.nextCursor);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Promos tab: getPromos failed');
          setError(err.message);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };

    loadPromos();
    return () => ac.abort();
  }, [faction.stableId, filter]);

  const sortedItems = useMemo(() => sortPromos(items, sort), [items, sort]);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await factionsApi.getPromos(faction.stableId, {
        filter,
        limit: PAGE_LIMIT,
        cursor,
      });
      setItems((prev) => [...prev, ...response.items]);
      setCursor(response.nextCursor);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        logger.error('Promos tab: load more failed');
        setError(err.message);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const sortOptions = [
    { value: 'newest', label: t('factions.promos.sortNewest', 'Newest') },
    ...(hasViewCounts ? [{ value: 'viewed', label: t('factions.promos.sortViewed', 'Most Viewed') }] : []),
    ...(hasHeatImpacts ? [{ value: 'heat', label: t('factions.promos.sortHeat', 'Highest Heat') }] : []),
  ];

  return (
    <div className="group-page">
      <div className="group-toolbar">
        <Tabs
          label={t('factions.promos.filterLabel', 'Promo filter')}
          value={filter}
          onValueChange={(value) => setFilter(value as FactionPromoFilter)}
          items={FILTER_OPTIONS.map((option) => ({ value: option.value, label: t(option.i18nKey, option.fallback) }))}
        />
        {sortOptions.length > 1 && (
          <Select
            className="group-toolbar__push"
            label={t('factions.promos.sortLabel', 'Sort promos')}
            value={sort}
            onValueChange={(value) => setSort(value as SortKey)}
            options={sortOptions}
          />
        )}
      </div>

      {error && (
        <p className="group-error" role="alert">
          {t('factions.promos.error', 'Could not load promos.')}: {error}
        </p>
      )}

      {loading ? (
        <Skeleton variant="cards" count={3} />
      ) : sortedItems.length === 0 ? (
        <EmptyState
          title={t('factions.detailTabs.promos', 'Promos')}
          description={t('factions.promos.empty', 'No promos match this filter yet.')}
        />
      ) : (
        <div className="faction-promos__grid">
          {sortedItems.map((promo) => {
            const byline =
              filter === 'directed-at-faction'
                ? t('factions.promos.directedAt', 'Directed at: {{name}}', {
                    name: promo.targetWrestlerName ?? faction.name,
                  })
                : t('factions.promos.byline', 'By {{name}}', { name: promo.authorWrestlerName });

            const heat = promo.heatImpact;
            // With no title, the start of the body stands in as the headline.
            const headline = promo.headline ?? promo.excerpt.slice(0, 60);
            const bodyText = promo.headline && promo.excerpt ? promo.excerpt : '';

            return (
              <article key={promo.promoId} className="faction-promos__card">
                <Link to={`/promos/${promo.promoId}`} className="faction-promos__link">
                  {promo.thumbnail && (
                    <img src={promo.thumbnail} alt="" className="faction-promos__image" loading="lazy" />
                  )}
                  <span className="group-muted">{byline}</span>
                  <h3 className="faction-promos__headline">{headline}</h3>
                  {bodyText && <p className="faction-promos__body">{bodyText}</p>}
                  <span className="faction-promos__meta">
                    <time dateTime={promo.date}>{new Date(promo.date).toLocaleDateString()}</time>
                    {promo.viewCount !== null && promo.viewCount !== undefined && (
                      <span
                        className="faction-promos__views"
                        aria-label={t('factions.promos.viewsLabel', '{{count}} views', { count: promo.viewCount })}
                      >
                        <Eye aria-hidden="true" size={14} />
                        {promo.viewCount}
                      </span>
                    )}
                    {heat !== null && heat !== undefined && (
                      <Badge tone={heat > 0 ? 'win' : heat < 0 ? 'loss' : 'draw'}>
                        {heat > 0 ? `+${heat}` : heat}
                      </Badge>
                    )}
                  </span>
                </Link>
                {filter === 'directed-at-faction' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    to={`/promos/new?targetPlayerId=${promo.authorPlayerId}&promoType=response&targetPromoId=${promo.promoId}`}
                  >
                    {t('factions.promos.replyCta', 'Reply with a promo')}
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {cursor && !loading && (
        <div className="faction-promos__more">
          <Button variant="secondary" onClick={handleLoadMore} loading={loadingMore}>
            {loadingMore ? t('common.loading', 'Loading…') : t('factions.promos.loadMore', 'Load more')}
          </Button>
        </div>
      )}
    </div>
  );
}
