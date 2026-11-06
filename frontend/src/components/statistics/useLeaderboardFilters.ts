import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { matchTypesApi, seasonsApi, stipulationsApi } from '../../services/api';
import { useStatsResource } from './useStatsResource';

const MATCH_TYPES_PATH = '/stats/match-types';

const loadSeasons = (signal: AbortSignal) => seasonsApi.getAll(signal);
const loadMatchTypes = (signal: AbortSignal) => matchTypesApi.getAll(signal);
const loadStipulations = (signal: AbortSignal) => stipulationsApi.getAll(signal);

/**
 * Season, match type and stipulation filters, held in the URL so they carry
 * between the two leaderboard pages. Choosing a match type or stipulation on
 * /stats/leaderboards moves to the filtered board at /stats/match-types.
 */
export function useLeaderboardFilters() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: seasons } = useStatsResource(loadSeasons);
  const { data: matchTypes } = useStatsResource(loadMatchTypes);
  const { data: stipulations } = useStatsResource(loadStipulations);

  const seasonId = searchParams.get('season') ?? '';
  const matchTypeId = searchParams.get('matchType') ?? '';
  const stipulationId = searchParams.get('stipulation') ?? '';

  const setSeason = useCallback((nextSeasonId: string) => {
    const next = new URLSearchParams(searchParams);
    if (nextSeasonId) next.set('season', nextSeasonId);
    else next.delete('season');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  /** Match type and stipulation are exclusive: the API ranks by one or the other. */
  const applyMatchFilter = useCallback((name: 'matchType' | 'stipulation', value: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete('matchType');
    next.delete('stipulation');
    if (value) next.set(name, value);
    navigate(
      { pathname: MATCH_TYPES_PATH, search: next.toString() },
      { replace: pathname === MATCH_TYPES_PATH },
    );
  }, [navigate, pathname, searchParams]);

  return useMemo(() => ({
    seasons: seasons ?? [],
    matchTypes: matchTypes ?? [],
    stipulations: stipulations ?? [],
    seasonId,
    matchTypeId,
    stipulationId,
    setSeason,
    setMatchType: (value: string) => applyMatchFilter('matchType', value),
    setStipulation: (value: string) => applyMatchFilter('stipulation', value),
  }), [seasons, matchTypes, stipulations, seasonId, matchTypeId, stipulationId, setSeason, applyMatchFilter]);
}

export type LeaderboardFilterState = ReturnType<typeof useLeaderboardFilters>;
