import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { factionsApi, playersApi, profileApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { logger } from '../../utils/logger';
import type { Player } from '../../types';
import type { Stable, StableStanding } from '../../types/stable';
import FactionCard from './FactionCard';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import {
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../constants/imageFallbacks';
import {
  deriveFactionActivity,
  type DerivedFactionActivityItem,
} from './factionActivity';
import './FactionsList.css';

type StatusFilter = 'all' | 'pending' | 'active' | 'disbanded';

const STATUS_FILTERS: ReadonlyArray<StatusFilter> = ['all', 'pending', 'active', 'disbanded'];

function matchesStatusFilter(faction: Stable, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return faction.status === 'active' || faction.status === 'approved';
  return faction.status === filter;
}

export default function FactionsList() {
  const { t } = useTranslation();
  useDocumentTitle(t('factions.title', 'Factions'));
  const location = useLocation();
  const { isAuthenticated, isWrestler } = useAuth();

  const [factions, setFactions] = useState<Stable[]>([]);
  const [standings, setStandings] = useState<StableStanding[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myProfile, setMyProfile] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const ac = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        // Standings and players power the per-card hydration (heat gauge,
        // leader name, roster avatars). They're fetched alongside the
        // factions list so cards render in a single pass.
        const [factionList, standingsList, playerList] = await Promise.all([
          factionsApi.getAll(undefined, ac.signal),
          factionsApi.getStandings(ac.signal).catch(() => [] as StableStanding[]),
          playersApi.getAll(ac.signal).catch(() => [] as Player[]),
        ]);

        if (ac.signal.aborted) return;
        setFactions(factionList);
        setStandings(standingsList);
        setPlayers(playerList);

        // Profile is only fetched for authenticated wrestlers — it gates
        // the "Request a Faction" CTA. A failure here is non-fatal.
        if (isAuthenticated && isWrestler) {
          try {
            const profile = await profileApi.getMyProfile(ac.signal);
            if (!ac.signal.aborted) setMyProfile(profile);
          } catch (e) {
            if (e instanceof Error && e.name !== 'AbortError') {
              logger.error('Failed to load profile for CTA gating');
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Failed to load factions hub');
          setError(err.message || 'Failed to load factions');
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };

    load();
    return () => ac.abort();
  }, [isAuthenticated, isWrestler]);

  const playerById = useMemo(
    () => new Map<string, Player>(players.map((p) => [p.playerId, p])),
    [players],
  );

  const streakByFaction = useMemo(
    () => new Map(standings.map((s) => [s.stableId, s.currentStreak])),
    [standings],
  );

  const filteredFactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return factions.filter((f) => {
      if (!matchesStatusFilter(f, statusFilter)) return false;
      if (q && !f.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [factions, statusFilter, searchQuery]);

  const activity: DerivedFactionActivityItem[] = useMemo(
    () => deriveFactionActivity(factions, playerById),
    [factions, playerById],
  );

  const showRequestCta = Boolean(
    isAuthenticated && isWrestler && myProfile && !myProfile.stableId,
  );

  if (loading) {
    return <Skeleton variant="cards" count={6} className="factions-skeleton" />;
  }

  if (error) {
    return (
      <div className="error">
        <p>{t('common.error', 'Error')}: {error}</p>
        <button onClick={() => window.location.reload()}>{t('common.retry', 'Retry')}</button>
      </div>
    );
  }

  return (
    <div className="factions-hub">
      <header className="factions-hub__header">
        <h1 className="factions-hub__title">{t('factions.title', 'Factions')}</h1>

        <nav className="factions-hub__tabs" aria-label={t('factions.title', 'Factions')}>
          <NavLink
            to="/factions"
            end
            className={({ isActive }) =>
              `factions-hub__tab ${isActive ? 'factions-hub__tab--active' : ''}`
            }
          >
            {t('factions.hub.tabAll', 'All Factions')}
          </NavLink>
          <NavLink
            to="/factions/standings"
            className={({ isActive }) =>
              `factions-hub__tab ${isActive ? 'factions-hub__tab--active' : ''}`
            }
          >
            {t('factions.hub.tabStandings', 'Standings')}
          </NavLink>
          <NavLink
            to="/my-faction"
            className={({ isActive }) =>
              `factions-hub__tab ${isActive ? 'factions-hub__tab--active' : ''}`
            }
          >
            {t('factions.hub.tabMine', 'My Faction')}
          </NavLink>
        </nav>

        {showRequestCta && (
          <Link
            to="/my-faction"
            state={{ from: location.pathname }}
            className="factions-hub__cta"
          >
            {t('factions.hub.requestCta', 'Request a Faction')}
          </Link>
        )}
      </header>

      <div
        className="factions-hub__filters"
        role="tablist"
        aria-label={t('factions.hub.filterLabel', 'Filter by status')}
      >
        {STATUS_FILTERS.map((status) => {
          const isActive = statusFilter === status;
          const labelKey = `filter${status.charAt(0).toUpperCase()}${status.slice(1)}`;
          return (
            <button
              key={status}
              type="button"
              role="tab"
              aria-pressed={isActive}
              className={`factions-hub__chip ${isActive ? 'factions-hub__chip--active' : ''}`}
              onClick={() => setStatusFilter(status)}
            >
              {t(`factions.hub.${labelKey}`, status)}
            </button>
          );
        })}

        <label className="factions-hub__search">
          <span className="visually-hidden">
            {t('factions.hub.searchLabel', 'Search factions by name')}
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('factions.hub.searchPlaceholder', 'Search factions…')}
          />
        </label>
      </div>

      <div className="factions-hub__main">
        <section className="factions-hub__grid" aria-live="polite">
          {filteredFactions.length === 0 ? (
            <EmptyState
              title={t('factions.title', 'Factions')}
              description={t('factions.hub.noResults', 'No factions match the current filter or search.')}
            />
          ) : (
            filteredFactions.map((faction) => (
              <FactionCard
                key={faction.stableId}
                faction={faction}
                playerById={playerById}
                currentStreak={streakByFaction.get(faction.stableId)}
              />
            ))
          )}
        </section>

        <aside className="factions-hub__rail" aria-label={t('factions.hub.activityTitle', 'Recent Faction Activity')}>
          <h2 className="factions-hub__rail-title">
            {t('factions.hub.activityTitle', 'Recent Faction Activity')}
          </h2>
          {activity.length === 0 ? (
            <p className="factions-hub__rail-empty">
              {t('factions.hub.activityEmpty', 'No recent activity yet.')}
            </p>
          ) : (
            <ul className="factions-hub__rail-list">
              {activity.map((entry) => (
                <li key={entry.id} className="factions-hub__rail-item">
                  <img
                    src={resolveImageSrc(entry.actorImageUrl, DEFAULT_WRESTLER_IMAGE)}
                    onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                    alt=""
                    className="factions-hub__rail-avatar"
                  />
                  <div className="factions-hub__rail-body">
                    <p className="factions-hub__rail-summary">{entry.summary}</p>
                    <time className="factions-hub__rail-time" dateTime={entry.timestamp}>
                      {new Date(entry.timestamp).toLocaleDateString()}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
