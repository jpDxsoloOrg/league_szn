import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { factionsApi, playersApi, profileApi } from '../../services/api';
import type { PlayerDirectoryEntry } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { logger } from '../../utils/logger';
import type { Player } from '../../types';
import type { Stable, StableStanding } from '../../types/stable';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import FactionCard from './FactionCard';
import FactionsHubTabs from './FactionsHubTabs';
import { deriveFactionActivity } from './factionActivity';
import { useLocationToast } from './useLocationToast';
import './groupUi.css';
import './FactionsList.css';

type StatusFilter = 'all' | 'pending' | 'active' | 'disbanded';

const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; i18nKey: string; fallback: string }> = [
  { value: 'all', i18nKey: 'factions.hub.filterAll', fallback: 'All' },
  { value: 'pending', i18nKey: 'factions.hub.filterPending', fallback: 'Pending Approval' },
  { value: 'active', i18nKey: 'factions.hub.filterActive', fallback: 'Active' },
  { value: 'disbanded', i18nKey: 'factions.hub.filterDisbanded', fallback: 'Disbanded' },
];

function matchesStatusFilter(faction: Stable, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return faction.status === 'active' || faction.status === 'approved';
  return faction.status === filter;
}

export default function FactionsList() {
  const { t } = useTranslation();
  useDocumentTitle(t('factions.title', 'Factions'));
  useLocationToast();
  const { isAuthenticated, isWrestler } = useAuth();

  const [factions, setFactions] = useState<Stable[]>([]);
  const [standings, setStandings] = useState<StableStanding[]>([]);
  const [directory, setDirectory] = useState<PlayerDirectoryEntry[]>([]);
  const [myProfile, setMyProfile] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        // The directory rather than the roster, so a leader with no wrestler still has a name.
        const [factionList, standingsList, directoryList] = await Promise.all([
          factionsApi.getAll(undefined, controller.signal),
          factionsApi.getStandings(controller.signal).catch(() => [] as StableStanding[]),
          playersApi.getDirectory(controller.signal).catch(() => [] as PlayerDirectoryEntry[]),
        ]);

        if (controller.signal.aborted) return;
        setFactions(factionList);
        setStandings(standingsList);
        setDirectory(directoryList);

        // Only gates the "Request a Faction" button, so a failure is not fatal.
        if (isAuthenticated && isWrestler) {
          try {
            const profile = await profileApi.getMyProfile(controller.signal);
            if (!controller.signal.aborted) setMyProfile(profile);
          } catch (profileError) {
            if (profileError instanceof Error && profileError.name !== 'AbortError') {
              logger.error('Failed to load profile for CTA gating');
            }
          }
        }
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name !== 'AbortError') {
          logger.error('Failed to load factions hub');
          setError(loadError.message || 'Failed to load factions');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [isAuthenticated, isWrestler, reloadKey]);

  const nameById = useMemo(
    () => new Map(directory.map((entry) => [entry.playerId, entry.name])),
    [directory],
  );

  const standingByFaction = useMemo(
    () => new Map(standings.map((standing) => [standing.stableId, standing])),
    [standings],
  );

  const filteredFactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return factions.filter((faction) => (
      matchesStatusFilter(faction, statusFilter)
      && (!query || faction.name.toLowerCase().includes(query))
    ));
  }, [factions, statusFilter, searchQuery]);

  const activity = useMemo(() => deriveFactionActivity(factions), [factions]);

  const showRequestCta = Boolean(isAuthenticated && isWrestler && myProfile && !myProfile.stableId);

  const header = (
    <>
      <PageHeader
        title={t('factions.title', 'Factions')}
        actions={showRequestCta ? (
          <Button to="/my-faction">{t('factions.hub.requestCta', 'Request a Faction')}</Button>
        ) : undefined}
      />
      <FactionsHubTabs />
    </>
  );

  if (loading) {
    return (
      <div className="group-page">
        {header}
        <Skeleton variant="cards" count={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="group-page">
        {header}
        <EmptyState
          title={t('common.error', 'Error')}
          description={error}
          actionLabel={t('common.retry', 'Retry')}
          onAction={() => setReloadKey((key) => key + 1)}
        />
      </div>
    );
  }

  return (
    <div className="group-page">
      {header}

      <div className="group-toolbar factions-hub__toolbar">
        <Select
          className="factions-hub__status"
          label={t('factions.hub.filterLabel', 'Filter by status')}
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          options={STATUS_FILTERS.map(({ value, i18nKey, fallback }) => ({ value, label: t(i18nKey, fallback) }))}
        />
        <label className="group-search">
          <span className="sr-only">{t('factions.hub.searchLabel', 'Search factions by name')}</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('factions.hub.searchPlaceholder', 'Search factions…')}
          />
        </label>
      </div>

      <div className="factions-hub__main">
        <section aria-live="polite">
          {filteredFactions.length === 0 ? (
            <EmptyState
              title={t('factions.noStables', 'No factions found')}
              description={t('factions.hub.noResults', 'No factions match the current filter or search.')}
            />
          ) : (
            <div className="factions-hub__grid">
              {filteredFactions.map((faction) => (
                <FactionCard
                  key={faction.stableId}
                  faction={faction}
                  leaderName={nameById.get(faction.leaderId)}
                  standing={standingByFaction.get(faction.stableId)}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="group-section" aria-label={t('factions.hub.activityTitle', 'Recent Faction Activity')}>
          <h2 className="group-heading">{t('factions.hub.activityTitle', 'Recent Faction Activity')}</h2>
          {activity.length === 0 ? (
            <p className="group-empty">{t('factions.hub.activityEmpty', 'No recent activity yet.')}</p>
          ) : (
            <ul className="group-list">
              {activity.map((entry) => (
                <li key={entry.id} className="group-person">
                  <Avatar src={entry.imageUrl} name={entry.factionName} size="sm" />
                  <span className="group-person__text">
                    <span>
                      {entry.kind === 'formed'
                        ? t('factions.redesign.activityFormed', '{{name}} was formed', { name: entry.factionName })
                        : t('factions.redesign.activityDisbanded', '{{name}} was disbanded', { name: entry.factionName })}
                    </span>
                    <time className="group-muted" dateTime={entry.timestamp}>
                      {new Date(entry.timestamp).toLocaleDateString()}
                    </time>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
