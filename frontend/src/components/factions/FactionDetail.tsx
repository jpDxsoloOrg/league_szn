import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { factionsApi } from '../../services/api';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { logger } from '../../utils/logger';
import type { StableDetailResponse, StableStatus } from '../../types/stable';
import { DEFAULT_FACTION_IMAGE, applyImageFallback } from '../../constants/imageFallbacks';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import SectionTabs from '../ui/SectionTabs';
import Skeleton from '../ui/Skeleton';
import FactionHeat from './FactionHeat';
import { formatRecord } from './factionFormat';
import { useLocationToast } from './useLocationToast';
import './groupUi.css';
import './FactionDetail.css';

/** Tabs receive the loaded faction here so they do not refetch it on mount. */
export interface FactionDetailContext {
  faction: StableDetailResponse;
}

const TABS = [
  { path: '', i18nKey: 'factions.detailTabs.overview', fallback: 'Overview' },
  { path: 'members', i18nKey: 'factions.detailTabs.members', fallback: 'Members' },
  { path: 'stats', i18nKey: 'factions.detailTabs.stats', fallback: 'Stats' },
  { path: 'schedule', i18nKey: 'factions.detailTabs.schedule', fallback: 'Schedule' },
  { path: 'promos', i18nKey: 'factions.detailTabs.promos', fallback: 'Promos' },
  { path: 'messages', i18nKey: 'factions.detailTabs.messages', fallback: 'Messages' },
  { path: 'manage', i18nKey: 'factions.detailTabs.manage', fallback: 'Manage' },
] as const;

const STATUS_TONES: Record<StableStatus, BadgeTone> = {
  pending: 'warning',
  approved: 'win',
  active: 'win',
  disbanded: 'draw',
};

const STATUS_FALLBACKS: Record<StableStatus, string> = {
  pending: 'Pending',
  approved: 'Active',
  active: 'Active',
  disbanded: 'Disbanded',
};

export default function FactionDetail() {
  const { t } = useTranslation();
  const { factionId } = useParams<{ factionId: string }>();
  const { pathname } = useLocation();
  useLocationToast();
  const [faction, setFaction] = useState<StableDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useDocumentTitle(faction?.name ?? t('factions.detail', 'Faction Detail'));

  useEffect(() => {
    if (!factionId) return;
    const controller = new AbortController();

    const fetchFaction = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await factionsApi.getById(factionId, controller.signal);
        if (!controller.signal.aborted) setFaction(data);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Failed to load faction detail');
          setError(err.message || 'Failed to load faction');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchFaction();
    return () => controller.abort();
  }, [factionId, reloadKey]);

  if (loading) return <Skeleton variant="block" count={4} />;

  if (error || !faction) {
    return (
      <div className="group-page">
        <EmptyState
          title={error ? t('common.error', 'Error') : t('factions.notFound', 'Faction not found.')}
          description={error ?? undefined}
          actionLabel={error ? t('common.retry', 'Retry') : undefined}
          onAction={error ? () => setReloadKey((key) => key + 1) : undefined}
        />
        <Link to="/factions" className="faction-detail__back-link">
          {t('factions.backToList', 'Back to Factions')}
        </Link>
      </div>
    );
  }

  const outletContext: FactionDetailContext = { faction };
  const leaderName = faction.leaderName ?? t('factions.unknownLeader', 'Unknown');

  // A custom banner usually carries the name in its artwork, so the title is
  // kept for screen readers only rather than reading twice on screen.
  const hasCustomBanner = Boolean(faction.imageUrl);

  return (
    <div className="group-page">
      <header className="faction-detail__hero">
        {hasCustomBanner && (
          <img
            src={faction.imageUrl}
            onError={(event) => applyImageFallback(event, DEFAULT_FACTION_IMAGE)}
            alt={t('factions.heroAlt', '{{name}} faction banner', { name: faction.name })}
            className="faction-detail__hero-image"
          />
        )}
        <div className="faction-detail__hero-content">
          <div className="faction-detail__identity">
            <Badge tone={STATUS_TONES[faction.status]}>
              {t(`factions.hub.status.${faction.status}`, STATUS_FALLBACKS[faction.status])}
            </Badge>
            <h1 className={hasCustomBanner ? 'sr-only' : 'faction-detail__name'}>{faction.name}</h1>
            <p className="faction-detail__leader">
              {t('factions.hub.ledBy', 'Led by {{name}}', { name: leaderName })}
            </p>
          </div>
          <div className="faction-detail__record">
            <span className="faction-detail__record-label">{t('factions.recordLabel', 'RECORD')}</span>
            <span className="faction-detail__record-value">
              {formatRecord(faction.wins, faction.losses, faction.draws)}
            </span>
            <FactionHeat count={faction.standings.currentStreak?.count} />
          </div>
        </div>
      </header>

      <SectionTabs
        label={t('factions.detailTabs.label', 'Faction sections')}
        activeTo={pathname.replace(/\/$/, '')}
        items={TABS.map((tab) => ({
          to: tab.path === '' ? `/factions/${factionId}` : `/factions/${factionId}/${tab.path}`,
          label: t(tab.i18nKey, tab.fallback),
        }))}
      />

      <Outlet context={outletContext} />
    </div>
  );
}
