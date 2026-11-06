import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { statisticsApi, seasonsApi } from '../../services/api';
import type { HeadToHeadResponse, StatsPlayer } from '../../services/api';
import { useStatsResource } from './useStatsResource';

const loadPlayers = async (signal: AbortSignal): Promise<StatsPlayer[]> =>
  (await statisticsApi.getHeadToHeadPlayers(signal)).players;

const loadSeasons = (signal: AbortSignal) => seasonsApi.getAll(signal);

/** Fills a missing or unknown slot with the first player not in the other slot. */
function resolvePair(players: StatsPlayer[], requestedFirst: string, requestedSecond: string): [string, string] {
  const known = (playerId: string) => players.some((player) => player.playerId === playerId);
  const firstOther = (excludedId: string) =>
    players.find((player) => player.playerId !== excludedId)?.playerId ?? '';

  const first = known(requestedFirst) ? requestedFirst : '';
  const second = known(requestedSecond) ? requestedSecond : '';
  const player1Id = first || firstOther(second);
  return [player1Id, second || firstOther(player1Id)];
}

/**
 * Selection lives in the URL so links can preselect a matchup and the
 * Compare and Tale of the Tape views share it. `player1Id` and `player2Id`
 * are read as well because links with those names are already in use.
 */
export function useHeadToHead() {
  const [searchParams, setSearchParams] = useSearchParams();
  const roster = useStatsResource(loadPlayers);
  const { data: seasons } = useStatsResource(loadSeasons);

  const players = roster.data ?? [];
  const [player1Id, player2Id] = resolvePair(
    players,
    searchParams.get('player1') ?? searchParams.get('player1Id') ?? '',
    searchParams.get('player2') ?? searchParams.get('player2Id') ?? '',
  );
  const seasonId = searchParams.get('season') ?? '';

  const loadComparison = useCallback(
    async (signal: AbortSignal): Promise<HeadToHeadResponse | null> => {
      if (!player1Id || !player2Id || player1Id === player2Id) return null;
      return statisticsApi.getHeadToHead(player1Id, player2Id, seasonId || undefined, signal);
    },
    [player1Id, player2Id, seasonId],
  );
  const comparison = useStatsResource(loadComparison);

  const select = (selection: { player1?: string; player2?: string; season?: string }) => {
    const next = new URLSearchParams();
    next.set('player1', selection.player1 ?? player1Id);
    next.set('player2', selection.player2 ?? player2Id);
    const nextSeason = selection.season ?? seasonId;
    if (nextSeason) next.set('season', nextSeason);
    setSearchParams(next, { replace: true });
  };

  return { roster, players, seasons: seasons ?? [], player1Id, player2Id, seasonId, comparison, select };
}
