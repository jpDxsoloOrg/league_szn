import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, SlidersHorizontal } from 'lucide-react';
import { matchesApi, playersApi, seasonsApi, championshipsApi, stipulationsApi, matchTypesApi } from '../services/api';
import type { PlayerDirectoryEntry } from '../services/api/players.api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useShowMore } from '../hooks/useShowMore';
import type { Match, MatchFilters, Season, Championship, Stipulation, MatchType } from '../types';
import Badge from './ui/Badge';
import type { BadgeTone } from './ui/Badge';
import Button from './ui/Button';
import EmptyState from './ui/EmptyState';
import Modal from './ui/Modal';
import PageHeader from './ui/PageHeader';
import Select from './ui/Select';
import ShowMore from './ui/ShowMore';
import Skeleton from './ui/Skeleton';
import Tabs from './ui/Tabs';
import { StarRating } from './matches/StarRating';
import { RateMatchWidget } from './matches/RateMatchWidget';
import { MotnToggleButton } from './matches/MotnToggleButton';
import { useAuth } from '../contexts/AuthContext';
import { formatMatchDate } from '../utils/dateUtils';
import { formatMatchType, groupMatchSides } from '../utils/matchDisplay';
import './MatchSearch.css';

const STATUS_TONES: Partial<Record<Match['status'], BadgeTone>> = {
  scheduled: 'primary',
  'open-signups': 'primary',
  completed: 'neutral',
  cancelled: 'loss',
};

const ROWS_PER_PAGE = 50;

/** Filters behind the Filters button. Status has its own tabs. */
const PANEL_FILTER_KEYS: (keyof MatchFilters)[] = [
  'playerId', 'matchType', 'stipulationId', 'championshipId', 'seasonId', 'dateFrom', 'dateTo',
];

const FILTER_KEYS: (keyof MatchFilters)[] = [
  'status', 'playerId', 'matchType', 'stipulationId', 'championshipId', 'seasonId', 'dateFrom', 'dateTo',
];

function filtersFromParams(params: URLSearchParams): MatchFilters {
  const filters: MatchFilters = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) {
      (filters as Record<string, string>)[key] = value;
    }
  }
  return filters;
}

function filtersToParams(filters: MatchFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params;
}

function hasActiveFilters(filters: MatchFilters): boolean {
  return Object.values(filters).some((v) => !!v);
}

export default function MatchSearch() {
  const { t } = useTranslation();
  const { isAdminOrModerator } = useAuth();
  useDocumentTitle(t('matchSearch.title'));
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [searchText, setSearchText] = useState('');

  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<PlayerDirectoryEntry[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [matchTypes, setMatchTypes] = useState<MatchType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [detailMatchId, setDetailMatchId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(
    () => PANEL_FILTER_KEYS.some((key) => !!searchParams.get(key)),
  );
  const focusedRowRef = useRef<HTMLLIElement>(null);

  // Other pages deep-link one match through router state or ?matchId=.
  const routeState = location.state as { matchId?: string } | null;
  const focusedMatchId = routeState?.matchId ?? searchParams.get('matchId');

  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);

  const updateFilter = useCallback((key: keyof MatchFilters, value: string) => {
    const next = { ...filtersFromParams(searchParams) };
    if (value) {
      (next as Record<string, string>)[key] = value;
    } else {
      delete (next as Record<string, string>)[key];
    }
    setSearchParams(filtersToParams(next), { replace: true });
  }, [searchParams, setSearchParams]);

  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  // Load reference data on mount
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const [playersData, seasonsData, championshipsData, stipulationsData, matchTypesData] = await Promise.all([
          playersApi.getDirectory(controller.signal),
          seasonsApi.getAll(controller.signal),
          championshipsApi.getAll(controller.signal),
          stipulationsApi.getAll(controller.signal),
          matchTypesApi.getAll(controller.signal),
        ]);
        if (!controller.signal.aborted) {
          setPlayers(playersData);
          setSeasons(seasonsData);
          setChampionships(championshipsData);
          setStipulations(stipulationsData);
          setMatchTypes(matchTypesData);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Failed to load reference data', err);
        }
      }
    };
    load();
    return () => controller.abort();
  }, []);

  // Load matches whenever filters change
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await matchesApi.getAll(
          hasActiveFilters(filters) ? filters : undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setMatches(data);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to load matches');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    load();
    return () => controller.abort();
  }, [filters, reloadKey]);

  useEffect(() => {
    if (!loading) focusedRowRef.current?.scrollIntoView({ block: 'center' });
  }, [loading, focusedMatchId]);

  const playerMap = useMemo(() => {
    const map = new Map<string, PlayerDirectoryEntry>();
    for (const p of players) map.set(p.playerId, p);
    return map;
  }, [players]);

  // The directory also covers hidden players so old matches keep their names.
  // Only a deep link that already filters by one keeps that player listed.
  const playerFilterOptions = useMemo(
    () => players
      .filter((player) => player.currentWrestler !== null || player.playerId === filters.playerId)
      .map((player) => ({ value: player.playerId, label: player.name })),
    [players, filters.playerId],
  );

  const championshipMap = useMemo(() => {
    const map = new Map<string, Championship>();
    for (const c of championships) map.set(c.championshipId, c);
    return map;
  }, [championships]);

  const stipulationMap = useMemo(() => {
    const map = new Map<string, Stipulation>();
    for (const s of stipulations) map.set(s.stipulationId, s);
    return map;
  }, [stipulations]);

  const seasonMap = useMemo(() => {
    const map = new Map<string, Season>();
    for (const s of seasons) map.set(s.seasonId, s);
    return map;
  }, [seasons]);

  const getPlayerName = useCallback(
    (id: string) => playerMap.get(id)?.name ?? t('common.unknown'),
    [playerMap, t],
  );

  const visibleMatches = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return matches;
    return matches.filter((match) => {
      const participantNames = match.participants.map((pid) => getPlayerName(pid)).join(' ');
      const stipulationName = match.stipulationId
        ? stipulationMap.get(match.stipulationId)?.name ?? ''
        : '';
      return `${participantNames} ${match.matchFormat} ${formatMatchType(match.matchFormat, t)} ${stipulationName}`
        .toLowerCase()
        .includes(query);
    });
  }, [matches, searchText, getPlayerName, stipulationMap, t]);

  const { count: visibleCount, showMore } = useShowMore(ROWS_PER_PAGE, `${searchParams.toString()}|${searchText}`);
  // A deep-linked match has to be on screen for the page to scroll to it.
  const focusedIndex = focusedMatchId ? visibleMatches.findIndex((match) => match.matchId === focusedMatchId) : -1;
  const shownCount = Math.min(visibleMatches.length, Math.max(visibleCount, focusedIndex + 1));

  const detailMatch = detailMatchId ? matches.find((match) => match.matchId === detailMatchId) : undefined;

  const updateMatch = useCallback((matchId: string, changes: Partial<Match>) => {
    setMatches((previous) => previous.map((match) => (match.matchId === matchId ? { ...match, ...changes } : match)));
  }, []);

  const statusLabel = (status: Match['status']) =>
    status === 'completed' || status === 'scheduled'
      ? t(`common.${status}`)
      : t(`matchSearch.status.${status}`, status);

  const activePanelFilters = PANEL_FILTER_KEYS.filter((key) => !!filters[key]).length;
  const allOption = { value: '', label: t('common.all') };

  const renderSelect = (
    key: keyof MatchFilters,
    label: string,
    id: string,
    options: { value: string; label: string }[],
  ) => (
    <div className="match-search-filter">
      <span className="match-search-filter__label">{label}</span>
      <Select
        id={id}
        label={label}
        value={filters[key] ?? ''}
        onValueChange={(value) => updateFilter(key, value)}
        options={[allOption, ...options]}
      />
    </div>
  );

  /** Open sign-ups start with nobody on the card, so the row says what is on offer instead. */
  const describeEmptyCard = (match: Match) => {
    const spots = match.slotsRequired ?? match.slots?.length;
    return match.status === 'open-signups' && spots
      ? t('matchSearch.spotsOpen', { count: spots })
      : t('matchSearch.noParticipants');
  };

  const renderNames = (match: Match) => {
    if (match.participants.length === 0) {
      return <span className="match-row__names">{describeEmptyCard(match)}</span>;
    }
    const isDraw = match.status === 'completed' && !!match.isDraw;
    const sides = groupMatchSides(match.participants, (pid) => pid, match.teams, match.matchFormat);
    const renderName = (pid: string) => (
      <span className={
        isDraw ? '' :
        match.winners?.includes(pid) ? 'match-winner' :
        match.losers?.includes(pid) ? 'match-loser' : ''
      }>
        {getPlayerName(pid)}
      </span>
    );
    return (
      <span className="match-row__names">
        {sides.map((side, sideIndex) => (
          <span key={side[0]} className="match-row__name-entry">
            {/* One vs between two sides; a bigger field reads as a plain list. */}
            {sideIndex > 0 && sides.length === 2 && <span className="match-vs">{t('common.vs')}</span>}
            <span>
              {side.map((pid, memberIndex) => (
                <span key={pid}>
                  {memberIndex > 0 && ' & '}
                  {renderName(pid)}
                </span>
              ))}
              {sides.length > 2 && sideIndex < sides.length - 1 && ','}
            </span>
          </span>
        ))}
      </span>
    );
  };

  const hasFilters = hasActiveFilters(filters);

  return (
    <div className="match-search-page">
      <PageHeader title={t('matchSearch.title')} />

      <div className="match-search-toolbar">
        <label className="match-search-box">
          <Search aria-hidden="true" size={18} />
          <span className="sr-only">{t('matchSearch.searchPlaceholder', 'Search matches, players...')}</span>
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t('matchSearch.searchPlaceholder', 'Search matches, players...')}
          />
        </label>
        <Tabs
          label={t('matchSearch.filters.status')}
          value={filters.status ?? 'all'}
          onValueChange={(value) => updateFilter('status', value === 'all' ? '' : value)}
          items={[
            { value: 'all', label: t('common.all') },
            { value: 'completed', label: t('common.completed') },
            { value: 'scheduled', label: t('common.scheduled') },
          ]}
        />
        <Button
          variant="secondary"
          icon={<SlidersHorizontal aria-hidden="true" size={18} />}
          aria-expanded={filtersOpen}
          aria-controls="match-search-filters"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {t('matchSearch.filtersButton', 'Filters')}
          {activePanelFilters > 0 && ` (${activePanelFilters})`}
        </Button>
      </div>

      {filtersOpen && (
        <div id="match-search-filters" className="match-search-filters" role="search" aria-label={t('matchSearch.filtersLabel')}>
          {renderSelect('playerId', t('matchSearch.filters.player'), 'filter-player',
            playerFilterOptions)}
          {renderSelect('matchType', t('matchSearch.filters.matchType'), 'filter-matchType',
            matchTypes.map((matchType) => ({ value: matchType.name, label: matchType.name })))}
          {renderSelect('stipulationId', t('matchSearch.filters.stipulation'), 'filter-stipulation',
            stipulations.map((stipulation) => ({ value: stipulation.stipulationId, label: stipulation.name })))}
          {renderSelect('championshipId', t('matchSearch.filters.championship'), 'filter-championship',
            championships.map((championship) => ({ value: championship.championshipId, label: championship.name })))}
          {renderSelect('seasonId', t('matchSearch.filters.season'), 'filter-season',
            seasons.map((season) => ({ value: season.seasonId, label: season.name })))}
          <div className="match-search-filter">
            <label className="match-search-filter__label" htmlFor="filter-dateFrom">{t('matchSearch.filters.dateFrom')}</label>
            <input
              id="filter-dateFrom"
              type="date"
              value={filters.dateFrom ?? ''}
              onChange={(e) => updateFilter('dateFrom', e.target.value)}
            />
          </div>
          <div className="match-search-filter">
            <label className="match-search-filter__label" htmlFor="filter-dateTo">{t('matchSearch.filters.dateTo')}</label>
            <input
              id="filter-dateTo"
              type="date"
              value={filters.dateTo ?? ''}
              onChange={(e) => updateFilter('dateTo', e.target.value)}
            />
          </div>
          <p className="match-search-filters__help">
            {t(
              'matchSearch.filtersHelp',
              'Filters are combined together. Use "Clear Filters" to quickly reset and broaden results.'
            )}{' '}
            <Link to="/guide/wiki/events">{t('matchSearch.learnMore', 'Learn more')}</Link>
          </p>
        </div>
      )}

      {hasFilters && (
        <div className="match-search-summary">
          <span className="results-count">{t('matchSearch.resultsCount', { count: matches.length })}</span>
          <Button variant="ghost" size="sm" onClick={clearFilters}>{t('matchSearch.filters.clearAll')}</Button>
        </div>
      )}

      {loading ? (
        <Skeleton variant="block" count={5} />
      ) : error ? (
        <EmptyState
          title={t('common.error')}
          description={error}
          actionLabel={t('common.retry')}
          onAction={() => setReloadKey((key) => key + 1)}
        />
      ) : visibleMatches.length === 0 ? (
        <EmptyState
          title={t('matchSearch.noResults')}
          description={
            hasFilters || searchText.trim()
              ? t('matchSearch.noResultsFiltered')
              : t('matchSearch.noMatches')
          }
          actionLabel={hasFilters ? t('matchSearch.filters.clearAll') : undefined}
          onAction={hasFilters ? clearFilters : undefined}
        />
      ) : (
        <ul className="match-search-results">
          {visibleMatches.slice(0, shownCount).map((match) => {
            const isFocused = match.matchId === focusedMatchId;
            const stipulationName = match.stipulationId ? stipulationMap.get(match.stipulationId)?.name : undefined;
            const hasStars = match.ratingsCount != null && match.ratingsCount > 0;

            return (
              <li
                key={match.matchId}
                ref={isFocused ? focusedRowRef : undefined}
                className={`match-row${isFocused ? ' match-row--focused' : ''}`}
                aria-current={isFocused ? 'true' : undefined}
              >
                <div className="match-row__main">
                  {renderNames(match)}
                  <span className="match-row__meta">
                    <span>{formatMatchDate(match.date)}</span>
                    <span>{formatMatchType(match.matchFormat, t)}{stipulationName ? ` · ${stipulationName}` : ''}</span>
                  </span>
                </div>
                <div className="match-row__side">
                  {match.isChampionship && <Badge tone="warning">{t('matchSearch.card.titleMatch', 'Title Match')}</Badge>}
                  {match.matchOfTheNight && <Badge tone="violet">{t('match.matchOfTheNight')}</Badge>}
                  <Badge tone={STATUS_TONES[match.status] ?? 'neutral'}>{statusLabel(match.status)}</Badge>
                  {hasStars && <StarRating starRating={match.starRating} ratingsCount={match.ratingsCount} size="sm" />}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('matchSearch.detailsFor', {
                      names: match.participants.length > 0
                        ? match.participants.map(getPlayerName).join(', ')
                        : describeEmptyCard(match),
                    })}
                    onClick={() => setDetailMatchId(match.matchId)}
                  >
                    {t('matchSearch.details', 'Details')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && !error && (
        <ShowMore shown={shownCount} total={visibleMatches.length} onShowMore={() => showMore(shownCount)} />
      )}

      <Modal
        open={!!detailMatch}
        onClose={() => setDetailMatchId(null)}
        title={t('matchSearch.detailsTitle', 'Match details')}
      >
        {detailMatch && (
          <div className="match-detail">
            {renderNames(detailMatch)}
            <dl className="match-detail__facts">
              <div>
                <dt>{t('matchSearch.detailDate', 'Date')}</dt>
                <dd>{formatMatchDate(detailMatch.date)}</dd>
              </div>
              <div>
                <dt>{t('matchSearch.filters.matchType')}</dt>
                <dd>{formatMatchType(detailMatch.matchFormat, t)}</dd>
              </div>
              <div>
                <dt>{t('matchSearch.filters.status')}</dt>
                <dd>{statusLabel(detailMatch.status)}</dd>
              </div>
              {detailMatch.stipulationId && stipulationMap.get(detailMatch.stipulationId) && (
                <div>
                  <dt>{t('matchSearch.filters.stipulation')}</dt>
                  <dd>{stipulationMap.get(detailMatch.stipulationId)?.name}</dd>
                </div>
              )}
              {detailMatch.championshipId && championshipMap.get(detailMatch.championshipId) && (
                <div>
                  <dt>{t('matchSearch.filters.championship')}</dt>
                  <dd>{championshipMap.get(detailMatch.championshipId)?.name}</dd>
                </div>
              )}
              {detailMatch.seasonId && seasonMap.get(detailMatch.seasonId) && (
                <div>
                  <dt>{t('matchSearch.filters.season')}</dt>
                  <dd>{seasonMap.get(detailMatch.seasonId)?.name}</dd>
                </div>
              )}
            </dl>
            {detailMatch.ratingsCount != null && detailMatch.ratingsCount > 0 && (
              <StarRating starRating={detailMatch.starRating} ratingsCount={detailMatch.ratingsCount} />
            )}
            {detailMatch.status === 'completed' && (
              <div className="match-rate-widget-wrap">
                <RateMatchWidget
                  matchId={detailMatch.matchId}
                  matchStatus={detailMatch.status}
                  userHasRated={detailMatch.userHasRated}
                  userRating={detailMatch.userRating}
                  onRated={(rating) => updateMatch(detailMatch.matchId, { userHasRated: true, userRating: rating })}
                />
                {isAdminOrModerator && (
                  <MotnToggleButton
                    matchId={detailMatch.matchId}
                    matchOfTheNight={!!detailMatch.matchOfTheNight}
                    onToggled={(value) => updateMatch(detailMatch.matchId, { matchOfTheNight: value })}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
