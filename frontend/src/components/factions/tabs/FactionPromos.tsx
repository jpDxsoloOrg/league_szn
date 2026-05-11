import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useOutletContext } from 'react-router-dom';
import { factionsApi } from '../../../services/api';
import { logger } from '../../../utils/logger';
import type {
  FactionPromoFilter,
  FactionPromoRow,
  FactionPromosResponse,
} from '../../../types/faction';
import type { FactionDetailContext } from '../FactionDetail';
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

    factionsApi
      .getPromos(faction.stableId, { filter, limit: PAGE_LIMIT }, ac.signal)
      .then((response: FactionPromosResponse) => {
        if (!ac.signal.aborted) {
          setItems(response.items);
          setCursor(response.nextCursor);
        }
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Promos tab: getPromos failed');
          setError(err.message);
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

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

  return (
    <div className="faction-promos">
      <div className="faction-promos__utility">
        <div
          className="faction-promos__filters"
          role="tablist"
          aria-label={t('factions.promos.filterLabel', 'Promo filter')}
        >
          {FILTER_OPTIONS.map((opt) => {
            const isActive = filter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-pressed={isActive}
                className={`faction-promos__filter ${isActive ? 'faction-promos__filter--active' : ''}`}
                onClick={() => setFilter(opt.value)}
              >
                {t(opt.i18nKey, opt.fallback)}
              </button>
            );
          })}
        </div>

        <label className="faction-promos__sort">
          <span className="visually-hidden">
            {t('factions.promos.sortLabel', 'Sort promos')}
          </span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="newest">{t('factions.promos.sortNewest', 'Newest')}</option>
            {hasViewCounts && (
              <option value="viewed">{t('factions.promos.sortViewed', 'Most Viewed')}</option>
            )}
            {hasHeatImpacts && (
              <option value="heat">{t('factions.promos.sortHeat', 'Highest Heat')}</option>
            )}
          </select>
        </label>
      </div>

      {error && (
        <p className="faction-promos__error" role="alert">
          {t('factions.promos.error', 'Could not load promos.')}: {error}
        </p>
      )}

      {loading ? (
        <p className="faction-promos__loading">{t('common.loading', 'Loading…')}</p>
      ) : sortedItems.length === 0 ? (
        <p className="faction-promos__empty">
          {t('factions.promos.empty', 'No promos match this filter yet.')}
        </p>
      ) : (
        <div className="faction-promos__grid">
          {sortedItems.map((promo) => {
            const byline =
              filter === 'directed-at-faction'
                ? t('factions.promos.directedAt', 'Directed at: {{name}}', {
                    name: promo.targetWrestlerName ?? faction.name,
                  })
                : t('factions.promos.byline', 'By {{name}}', { name: promo.authorWrestlerName });

            const heatPill =
              promo.heatImpact !== null && promo.heatImpact !== undefined ? (
                <span
                  className={`faction-promos__heat ${
                    promo.heatImpact > 0
                      ? 'faction-promos__heat--up'
                      : promo.heatImpact < 0
                        ? 'faction-promos__heat--down'
                        : 'faction-promos__heat--flat'
                  }`}
                >
                  {promo.heatImpact > 0 ? `+${promo.heatImpact}` : promo.heatImpact}
                </span>
              ) : null;

            return (
              <article key={promo.promoId} className="faction-promos__card">
                <Link to={`/promos/${promo.promoId}`} className="faction-promos__thumb-link">
                  <div className="faction-promos__thumb">
                    {promo.thumbnail ? (
                      <img src={promo.thumbnail} alt="" className="faction-promos__thumb-image" />
                    ) : (
                      <span className="faction-promos__thumb-placeholder" aria-hidden="true" />
                    )}
                    <span className="faction-promos__play-overlay" aria-hidden="true">▶</span>
                  </div>
                </Link>
                <div className="faction-promos__body">
                  <Link
                    to={`/promos/${promo.promoId}`}
                    className="faction-promos__headline-link"
                  >
                    <h3 className="faction-promos__headline">
                      {promo.headline ?? promo.excerpt}
                    </h3>
                  </Link>
                  <p className="faction-promos__byline">{byline}</p>
                  <div className="faction-promos__meta">
                    <time dateTime={promo.date}>
                      {new Date(promo.date).toLocaleDateString()}
                    </time>
                    {promo.viewCount !== null && promo.viewCount !== undefined && (
                      <span
                        className="faction-promos__views"
                        aria-label={t('factions.promos.viewsLabel', '{{count}} views', {
                          count: promo.viewCount,
                        })}
                      >
                        👁 {promo.viewCount}
                      </span>
                    )}
                    {heatPill}
                  </div>
                  {filter === 'directed-at-faction' && (
                    <Link
                      to={`/promos/new?targetPlayerId=${promo.authorPlayerId}&promoType=response&targetPromoId=${promo.promoId}`}
                      className="faction-promos__reply"
                    >
                      {t('factions.promos.replyCta', 'Reply with a promo')}
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {cursor && !loading && (
        <div className="faction-promos__load-more">
          <button
            type="button"
            className="faction-promos__load-more-btn"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore
              ? t('common.loading', 'Loading…')
              : t('factions.promos.loadMore', 'Load more')}
          </button>
        </div>
      )}
    </div>
  );
}
