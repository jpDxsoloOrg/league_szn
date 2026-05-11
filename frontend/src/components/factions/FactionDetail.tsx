import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { factionsApi } from '../../services/api';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { logger } from '../../utils/logger';
import type { StableDetailResponse } from '../../types/stable';
import {
  DEFAULT_FACTION_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../constants/imageFallbacks';
import Skeleton from '../ui/Skeleton';
import './FactionDetail.css';

/**
 * Outlet context contract — child tabs receive the loaded faction so they
 * don't re-fetch on mount. Each tab is free to fetch its own slice in
 * addition; the shell only loads the identity + standings record.
 */
export interface FactionDetailContext {
  faction: StableDetailResponse;
}

const HEAT_FLAME_COUNT = 5;

function clampHeat(count: number | undefined): number {
  if (!count || count < 0) return 0;
  return Math.min(HEAT_FLAME_COUNT, Math.floor(count));
}

function FlameIcon({ lit }: { lit: boolean }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      className={`faction-detail__flame ${lit ? 'faction-detail__flame--lit' : 'faction-detail__flame--dim'}`}
    >
      <path
        d="M8 .5s2.5 3 2.5 5.5a2.5 2.5 0 0 1-1 2 1.5 1.5 0 0 0 1.5-2.5C12.5 7 14 9 14 11a6 6 0 1 1-12 0c0-2.5 2-4.5 2-7 0 2 2 3 4 3.5 0-2-1-3-1-4.5 0-1 1-2.5 1-2.5z"
        fill="currentColor"
      />
    </svg>
  );
}

const TABS = [
  { value: 'overview', path: '', i18nKey: 'factions.detailTabs.overview', fallback: 'Overview' },
  { value: 'members', path: 'members', i18nKey: 'factions.detailTabs.members', fallback: 'Members' },
  { value: 'stats', path: 'stats', i18nKey: 'factions.detailTabs.stats', fallback: 'Stats' },
  { value: 'schedule', path: 'schedule', i18nKey: 'factions.detailTabs.schedule', fallback: 'Schedule' },
  { value: 'promos', path: 'promos', i18nKey: 'factions.detailTabs.promos', fallback: 'Promos' },
  { value: 'messages', path: 'messages', i18nKey: 'factions.detailTabs.messages', fallback: 'Messages' },
  { value: 'manage', path: 'manage', i18nKey: 'factions.detailTabs.manage', fallback: 'Manage' },
] as const;

export default function FactionDetail() {
  const { t } = useTranslation();
  const { factionId } = useParams<{ factionId: string }>();
  const [faction, setFaction] = useState<StableDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useDocumentTitle(faction?.name ?? t('factions.detail', 'Faction Detail'));

  useEffect(() => {
    if (!factionId) return;
    const ac = new AbortController();

    const fetchFaction = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await factionsApi.getById(factionId, ac.signal);
        if (!ac.signal.aborted) {
          setFaction(data);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Failed to load faction detail');
          setError(err.message || 'Failed to load faction');
        }
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchFaction();
    return () => ac.abort();
  }, [factionId, reloadKey]);

  if (loading) {
    return <Skeleton variant="block" count={4} className="faction-detail-skeleton" />;
  }

  if (error) {
    return (
      <div className="faction-detail__error">
        <p>{t('common.error', 'Error')}: {error}</p>
        <button
          type="button"
          className="faction-detail__retry"
          onClick={() => setReloadKey((k) => k + 1)}
        >
          {t('common.retry', 'Retry')}
        </button>
        <Link to="/factions" className="faction-detail__back-link">
          {t('factions.backToList', 'Back to Factions')}
        </Link>
      </div>
    );
  }

  if (!faction) {
    return (
      <div className="faction-detail__error">
        <p>{t('factions.notFound', 'Faction not found.')}</p>
        <Link to="/factions" className="faction-detail__back-link">
          {t('factions.backToList', 'Back to Factions')}
        </Link>
      </div>
    );
  }

  const litHeat = clampHeat(faction.standings.currentStreak?.count);
  const heatLabel = t('factions.hub.heatLabel', 'Heat: {{lit}} of {{total}}', {
    lit: litHeat,
    total: HEAT_FLAME_COUNT,
  });
  const statusFallbacks: Record<string, string> = {
    pending: 'Pending',
    approved: 'Active',
    active: 'Active',
    disbanded: 'Disbanded',
  };
  const statusLabel = t(
    `factions.hub.status.${faction.status}`,
    statusFallbacks[faction.status] ?? faction.status,
  );
  const leaderName = faction.leaderName ?? t('factions.unknownLeader', 'Unknown');

  const outletContext: FactionDetailContext = { faction };

  return (
    <div className="faction-detail">
      <header className="faction-detail__hero">
        <img
          src={resolveImageSrc(faction.imageUrl, DEFAULT_FACTION_IMAGE)}
          onError={(event) => applyImageFallback(event, DEFAULT_FACTION_IMAGE)}
          alt={t('factions.heroAlt', '{{name}} faction banner', { name: faction.name })}
          loading="lazy"
          className="faction-detail__hero-image"
        />
        <div className="faction-detail__hero-overlay" aria-hidden="true" />
        <div className="faction-detail__hero-content">
          <div className="faction-detail__hero-left">
            <h1 className="faction-detail__hero-name">{faction.name}</h1>
            <p className="faction-detail__hero-caption">
              <span
                className={`faction-detail__hero-status faction-detail__hero-status--${faction.status}`}
                aria-label={t('factions.statusLabel', 'Faction status: {{status}}', { status: statusLabel })}
              >
                {statusLabel}
              </span>
              <span className="faction-detail__hero-divider" aria-hidden="true">·</span>
              <span className="faction-detail__hero-led">
                {t('factions.hub.ledBy', 'Led by {{name}}', { name: leaderName })}
              </span>
            </p>
          </div>
          <div className="faction-detail__hero-right">
            <div className="faction-detail__hero-record">
              <span className="faction-detail__hero-record-label">
                {t('factions.recordLabel', 'RECORD')}
              </span>
              <span className="faction-detail__hero-record-value">
                {faction.wins}-{faction.losses}-{faction.draws}
              </span>
            </div>
            <div
              className="faction-detail__hero-heat"
              role="img"
              aria-label={heatLabel}
            >
              {Array.from({ length: HEAT_FLAME_COUNT }, (_, i) => (
                <FlameIcon key={i} lit={i < litHeat} />
              ))}
            </div>
          </div>
        </div>
      </header>

      <nav
        className="faction-detail__tabs"
        role="tablist"
        aria-label={t('factions.detailTabs.label', 'Faction sections')}
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.value}
            to={tab.path === '' ? `/factions/${factionId}` : `/factions/${factionId}/${tab.path}`}
            end={tab.path === ''}
            role="tab"
            className={({ isActive }) =>
              `faction-detail__tab ${isActive ? 'faction-detail__tab--active' : ''}`
            }
          >
            {t(tab.i18nKey, tab.fallback)}
          </NavLink>
        ))}
      </nav>

      <div className="faction-detail__content">
        <Outlet context={outletContext} />
      </div>
    </div>
  );
}
