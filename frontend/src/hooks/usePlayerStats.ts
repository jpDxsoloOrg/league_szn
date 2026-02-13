import { useState, useEffect, useMemo } from 'react';
import { statisticsApi, seasonsApi } from '../services/api';
import type { PlayerStatsResponse } from '../services/api';
import type { Season } from '../types';

interface UsePlayerStatsParams {
  playerId?: string;
}

export function usePlayerStats({ playerId }: UsePlayerStatsParams) {
  const [data, setData] = useState<PlayerStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');

  // Fetch seasons on mount
  useEffect(() => {
    const abortController = new AbortController();
    const fetchSeasons = async () => {
      try {
        const result = await seasonsApi.getAll(abortController.signal);
        setSeasons(result);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError('Failed to load seasons');
        }
      }
    };
    fetchSeasons();
    return () => abortController.abort();
  }, []);

  // Fetch player stats when playerId or selectedSeasonId changes
  useEffect(() => {
    if (!playerId) return;
    const abortController = new AbortController();
    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const seasonId = selectedSeasonId || undefined;
        const result = await statisticsApi.getPlayerStats(playerId, seasonId, abortController.signal);
        setData(result);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError('Failed to load player statistics');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
    return () => abortController.abort();
  }, [playerId, selectedSeasonId]);

  const overallStats = useMemo(
    () => data?.statistics?.find((s) => s.statType === 'overall'),
    [data]
  );

  const matchTypeStats = useMemo(
    () => data?.statistics?.filter((s) => s.statType !== 'overall') || [],
    [data]
  );

  const championshipStats = useMemo(
    () => data?.championshipStats || [],
    [data]
  );

  const achievements = useMemo(
    () => data?.achievements || [],
    [data]
  );

  const maxWinsAcrossTypes = useMemo(() => {
    return Math.max(...matchTypeStats.map((s) => s.wins), 1);
  }, [matchTypeStats]);

  return {
    data,
    loading,
    error,
    seasons,
    selectedSeasonId,
    setSelectedSeasonId,
    overallStats,
    matchTypeStats,
    championshipStats,
    achievements,
    maxWinsAcrossTypes,
  };
}
