import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { matchesApi, playersApi, seasonsApi, championshipsApi, stipulationsApi, matchTypesApi } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type { Match, MatchFilters, Player, Season, Championship, Stipulation, MatchType } from '../types';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import { StarRating } from './matches/StarRating';
import { RateMatchWidget } from './matches/RateMatchWidget';
import { MotnToggleButton } from './matches/MotnToggleButton';
import { useAuth } from '../contexts/AuthContext';
import './MatchSearch.css';

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
  // Mobile app layout (docs/design/mobile-app/league-szn-matches): search bar,
  // status chips, and W/L result cards. JSDOM has no matchMedia, so tests keep
  // exercising the desktop markup.
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [searchText, setSearchText] = useState('');

  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [matchTypes, setMatchTypes] = useState<MatchType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          playersApi.getAll(controller.signal),
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
  }, [filters]);

  const playerMap = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of players) map.set(p.playerId, p);
    return map;
  }, [players]);

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

  const getPlayerName = useCallback((id: string) => playerMap.get(id)?.name ?? id, [playerMap]);

  // Display-only quick search for the mobile layout. The input is rendered
  // only on phones, so `searchText` stays empty on desktop and this returns
  // the API result untouched there.
  const visibleMatches = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return matches;
    return matches.filter((match) => {
      const participantNames = match.participants.map((pid) => getPlayerName(pid)).join(' ');
      const stipulationName = match.stipulationId
        ? stipulationMap.get(match.stipulationId)?.name ?? ''
        : '';
      return `${participantNames} ${match.matchFormat} ${stipulationName}`
        .toLowerCase()
        .includes(query);
    });
  }, [matches, searchText, getPlayerName, stipulationMap]);

  const statusChips: { value: string; label: string }[] = [
    { value: '', label: t('common.all') },
    { value: 'completed', label: t('common.completed') },
    { value: 'scheduled', label: t('common.scheduled') },
  ];

  return (
    <div className="match-search-container">
      <div className="match-search-header page-title--mobile-hidden">
        <h2>{t('matchSearch.title')}</h2>
      </div>
      {isMobile && (
        <>
          <div className="match-search-bar">
            <svg
              className="match-search-bar-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
            <input
              type="search"
              className="match-search-bar-input"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t('matchSearch.searchPlaceholder', 'Search matches, players...')}
              aria-label={t('matchSearch.searchPlaceholder', 'Search matches, players...')}
            />
          </div>

          <div className="match-filter-chips" role="group" aria-label={t('matchSearch.filters.status')}>
            {statusChips.map((chip) => (
              <button
                key={chip.value || 'all'}
                type="button"
                className={`match-filter-chip ${(filters.status ?? '') === chip.value ? 'selected' : ''}`}
                aria-pressed={(filters.status ?? '') === chip.value}
                onClick={() => updateFilter('status', chip.value)}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {hasActiveFilters(filters) && (
            <div className="filter-actions mobile-filter-actions">
              <button type="button" className="clear-filters-btn" onClick={clearFilters}>
                {t('matchSearch.filters.clearAll')}
              </button>
              <span className="results-count">
                {t('matchSearch.resultsCount', { count: matches.length })}
              </span>
            </div>
          )}
        </>
      )}

      {!isMobile && (
      <>
      <p className="match-search-help">
        {t(
          'matchSearch.filtersHelp',
          'Filters are combined together. Use "Clear Filters" to quickly reset and broaden results.'
        )}{' '}
        <Link to="/guide/wiki/events">{t('matchSearch.learnMore', 'Learn more')}</Link>
      </p>

      {/* Filter Panel */}
      <div className="match-search-filters" role="search" aria-label={t('matchSearch.filtersLabel')}>
        <div className="filter-row">
          {/* Player */}
          <div className="filter-field">
            <label htmlFor="filter-player">{t('matchSearch.filters.player')}</label>
            <select
              id="filter-player"
              value={filters.playerId ?? ''}
              onChange={(e) => updateFilter('playerId', e.target.value)}
            >
              <option value="">{t('common.all')}</option>
              {players.map((p) => (
                <option key={p.playerId} value={p.playerId}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Match Type */}
          <div className="filter-field">
            <label htmlFor="filter-matchType">{t('matchSearch.filters.matchType')}</label>
            <select
              id="filter-matchType"
              value={filters.matchType ?? ''}
              onChange={(e) => updateFilter('matchType', e.target.value)}
            >
              <option value="">{t('common.all')}</option>
              {matchTypes.map((mt) => (
                <option key={mt.matchTypeId} value={mt.name}>{mt.name}</option>
              ))}
            </select>
          </div>

          {/* Stipulation */}
          <div className="filter-field">
            <label htmlFor="filter-stipulation">{t('matchSearch.filters.stipulation')}</label>
            <select
              id="filter-stipulation"
              value={filters.stipulationId ?? ''}
              onChange={(e) => updateFilter('stipulationId', e.target.value)}
            >
              <option value="">{t('common.all')}</option>
              {stipulations.map((s) => (
                <option key={s.stipulationId} value={s.stipulationId}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="filter-field">
            <label htmlFor="filter-status">{t('matchSearch.filters.status')}</label>
            <select
              id="filter-status"
              value={filters.status ?? ''}
              onChange={(e) => updateFilter('status', e.target.value)}
            >
              <option value="">{t('common.all')}</option>
              <option value="scheduled">{t('common.scheduled')}</option>
              <option value="completed">{t('common.completed')}</option>
            </select>
          </div>
        </div>

        <div className="filter-row">
          {/* Championship */}
          <div className="filter-field">
            <label htmlFor="filter-championship">{t('matchSearch.filters.championship')}</label>
            <select
              id="filter-championship"
              value={filters.championshipId ?? ''}
              onChange={(e) => updateFilter('championshipId', e.target.value)}
            >
              <option value="">{t('common.all')}</option>
              {championships.map((c) => (
                <option key={c.championshipId} value={c.championshipId}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Season */}
          <div className="filter-field">
            <label htmlFor="filter-season">{t('matchSearch.filters.season')}</label>
            <select
              id="filter-season"
              value={filters.seasonId ?? ''}
              onChange={(e) => updateFilter('seasonId', e.target.value)}
            >
              <option value="">{t('common.all')}</option>
              {seasons.map((s) => (
                <option key={s.seasonId} value={s.seasonId}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Date From */}
          <div className="filter-field">
            <label htmlFor="filter-dateFrom">{t('matchSearch.filters.dateFrom')}</label>
            <input
              id="filter-dateFrom"
              type="date"
              value={filters.dateFrom ?? ''}
              onChange={(e) => updateFilter('dateFrom', e.target.value)}
            />
          </div>

          {/* Date To */}
          <div className="filter-field">
            <label htmlFor="filter-dateTo">{t('matchSearch.filters.dateTo')}</label>
            <input
              id="filter-dateTo"
              type="date"
              value={filters.dateTo ?? ''}
              onChange={(e) => updateFilter('dateTo', e.target.value)}
            />
          </div>
        </div>

        {hasActiveFilters(filters) && (
          <div className="filter-actions">
            <button type="button" className="clear-filters-btn" onClick={clearFilters}>
              {t('matchSearch.filters.clearAll')}
            </button>
            <span className="results-count">
              {t('matchSearch.resultsCount', { count: matches.length })}
            </span>
          </div>
        )}
      </div>
      </>
      )}

      {/* Results */}
      {loading ? (
        <Skeleton variant="block" count={5} />
      ) : error ? (
        <EmptyState
          title={t('common.error')}
          description={error}
          actionLabel={t('common.retry')}
          onAction={() => setSearchParams(searchParams, { replace: true })}
        />
      ) : matches.length === 0 ? (
        <EmptyState
          title={t('matchSearch.noResults')}
          description={
            hasActiveFilters(filters)
              ? t('matchSearch.noResultsFiltered')
              : t('matchSearch.noMatches')
          }
          actionLabel={hasActiveFilters(filters) ? t('matchSearch.filters.clearAll') : undefined}
          onAction={hasActiveFilters(filters) ? clearFilters : undefined}
        />
      ) : (
        <div className="match-search-results">
          {isMobile && visibleMatches.length === 0 && (
            <p className="match-search-no-hits">{t('matchSearch.noResults')}</p>
          )}
          {isMobile && visibleMatches.map((match) => {
            const stipulationName = match.stipulationId
              ? stipulationMap.get(match.stipulationId)?.name
              : undefined;
            const seasonName = match.seasonId ? seasonMap.get(match.seasonId)?.name : undefined;
            const hasResult =
              match.status === 'completed' && !match.isDraw && !!match.winners?.length;
            const hasStars = match.ratingsCount != null && match.ratingsCount > 0;

            return (
              <div key={match.matchId} className={`match-card-m match-${match.status}`}>
                {(match.isChampionship || hasStars || match.status !== 'completed' || match.matchOfTheNight) && (
                  <div className="match-card-m-top">
                    {match.isChampionship && (
                      <span className="match-title-pill">
                        <svg
                          className="match-title-pill-belt"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M2 9h5.1a5 5 0 0 1 9.8 0H22v6h-5.1a5 5 0 0 1-9.8 0H2z" opacity="0.45" />
                          <circle cx="12" cy="12" r="4" />
                        </svg>
                        {t('matchSearch.card.titleMatch', 'Title Match')}
                      </span>
                    )}
                    {match.matchOfTheNight && (
                      <span className="match-tag motn-tag">{t('match.matchOfTheNight')}</span>
                    )}
                    <span className="match-card-m-top-right">
                      {match.status === 'scheduled' && (
                        <span className="match-status-pill scheduled">{t('common.scheduled')}</span>
                      )}
                      {hasStars && (
                        <StarRating
                          starRating={match.starRating}
                          ratingsCount={match.ratingsCount}
                          size="sm"
                        />
                      )}
                    </span>
                  </div>
                )}

                {hasResult ? (
                  <div className="match-card-m-result">
                    <div className="match-card-m-row winner">
                      <span className="match-card-m-names">
                        {(match.winners ?? []).map(getPlayerName).join(' & ')}
                      </span>
                      <span className="result-badge win" aria-label={t('common.completed')}>W</span>
                    </div>
                    <div className="match-card-m-def">{t('dashboard.def', 'def.')}</div>
                    <div className="match-card-m-row loser">
                      <span className="match-card-m-names">
                        {(match.losers ?? []).map(getPlayerName).join(' & ')}
                      </span>
                      <span className="result-badge loss">L</span>
                    </div>
                  </div>
                ) : (
                  <div className="match-card-m-vs">
                    {match.participants.map((pid, i) => (
                      <span key={pid} className="match-card-m-vs-entry">
                        {i > 0 && <span className="match-card-m-vs-sep">{t('common.vs')}</span>}
                        <span className="match-card-m-names">{getPlayerName(pid)}</span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="match-card-m-footer">
                  <span className="match-card-m-type">
                    {match.matchFormat}
                    {stipulationName ? ` · ${stipulationName}` : ''}
                  </span>
                  <span className="match-card-m-date">
                    {seasonName ? `${seasonName} · ` : ''}
                    {new Date(match.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>

                {match.status === 'completed' && (
                  <div className="match-rate-widget-wrap">
                    <RateMatchWidget
                      matchId={match.matchId}
                      matchStatus={match.status}
                      userHasRated={match.userHasRated}
                      userRating={match.userRating}
                    />
                    {isAdminOrModerator && (
                      <MotnToggleButton
                        matchId={match.matchId}
                        matchOfTheNight={!!match.matchOfTheNight}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!isMobile && matches.map((match) => (
            <div key={match.matchId} className={`match-card match-${match.status}`}>
              <div className="match-card-header">
                <span className="match-date">
                  {new Date(match.date).toLocaleDateString()}
                </span>
                <span className={`match-status-badge ${match.status}`}>
                  {t(`common.${match.status}`)}
                </span>
              </div>

              <div className="match-card-body">
                <div className="match-participants">
                  {match.participants.map((pid, i) => (
                    <span key={pid}>
                      {i > 0 && <span className="match-vs"> {t('common.vs')} </span>}
                      <span className={
                        match.winners?.includes(pid) ? 'match-winner' :
                        match.losers?.includes(pid) ? 'match-loser' : ''
                      }>
                        {getPlayerName(pid)}
                      </span>
                    </span>
                  ))}
                </div>

                <div className="match-meta">
                  {match.matchFormat && (
                    <span className="match-tag">{match.matchFormat}</span>
                  )}
                  {match.stipulationId && stipulationMap.get(match.stipulationId) && (
                    <span className="match-tag">{stipulationMap.get(match.stipulationId)!.name}</span>
                  )}
                  {match.championshipId && championshipMap.get(match.championshipId) && (
                    <span className="match-tag championship-tag">
                      {championshipMap.get(match.championshipId)!.name}
                    </span>
                  )}
                  {match.seasonId && seasonMap.get(match.seasonId) && (
                    <span className="match-tag season-tag">
                      {seasonMap.get(match.seasonId)!.name}
                    </span>
                  )}
                  {match.ratingsCount != null && match.ratingsCount > 0 && (
                    <span className="match-tag star-tag">
                      <StarRating
                        starRating={match.starRating}
                        ratingsCount={match.ratingsCount}
                        size="sm"
                      />
                    </span>
                  )}
                  {match.matchOfTheNight && (
                    <span className="match-tag motn-tag">{t('match.matchOfTheNight')}</span>
                  )}
                </div>

                {match.status === 'completed' && (
                  <div className="match-rate-widget-wrap">
                    <RateMatchWidget
                      matchId={match.matchId}
                      matchStatus={match.status}
                      userHasRated={match.userHasRated}
                      userRating={match.userRating}
                    />
                    {isAdminOrModerator && (
                      <MotnToggleButton
                        matchId={match.matchId}
                        matchOfTheNight={!!match.matchOfTheNight}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
