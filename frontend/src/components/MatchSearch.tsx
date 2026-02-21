import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { matchesApi, playersApi, seasonsApi, championshipsApi, stipulationsApi, matchTypesApi } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { Match, MatchFilters, Player, Season, Championship, Stipulation, MatchType } from '../types';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
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
  useDocumentTitle(t('matchSearch.title'));
  const [searchParams, setSearchParams] = useSearchParams();

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

  return (
    <div className="match-search-container">
      <div className="match-search-header">
        <h2>{t('matchSearch.title')}</h2>
      </div>

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
          {matches.map((match) => (
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
                  {match.starRating != null && match.starRating > 0 && (
                    <span className="match-tag star-tag">
                      {'★'.repeat(match.starRating)}
                    </span>
                  )}
                  {match.matchOfTheNight && (
                    <span className="match-tag motn-tag">{t('match.matchOfTheNight')}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
