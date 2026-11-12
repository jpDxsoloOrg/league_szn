import { useEffect, useState } from 'react';
import { championshipsApi, contendersApi } from '../services/api';
import type { ChampionshipContenders, ContenderListEntry, ContenderWithTagTeam } from '../types/contender';

/** Minimum matches the ranking job uses when a title has no config of its own. */
export const DEFAULT_MINIMUM_MATCHES = 3;

interface TagTitleBase {
  championshipId: string;
  championshipName: string;
  minimumMatches: number;
}

/** Where a tag team stands for one active tag title. */
export type TagTitleStanding =
  | (TagTitleBase & { status: 'champion' })
  | (TagTitleBase & {
      status: 'ranked';
      rank: number;
      movement: number;
      isNew: boolean;
      matchesInPeriod: number;
    })
  | (TagTitleBase & { status: 'unranked' });

export interface TagTeamContenderRanks {
  standings: TagTitleStanding[];
  loading: boolean;
  failed: boolean;
}

function isTagRowFor(tagTeamId: string) {
  return (entry: ContenderListEntry): entry is ContenderWithTagTeam =>
    entry.entityType === 'tagTeam' && entry.tagTeamId === tagTeamId;
}

/** Reads one tag title's contenders payload from the team's point of view. */
export function toTagTitleStanding(data: ChampionshipContenders, tagTeamId: string): TagTitleStanding {
  const base: TagTitleBase = {
    championshipId: data.championshipId,
    championshipName: data.championshipName,
    minimumMatches: data.config?.minimumMatches ?? DEFAULT_MINIMUM_MATCHES,
  };

  const champion = data.currentChampion;
  if (champion?.type === 'tagTeam' && champion.tagTeamId === tagTeamId) {
    return { ...base, status: 'champion' };
  }

  const row = data.contenders.find(isTagRowFor(tagTeamId));
  if (!row) return { ...base, status: 'unranked' };

  return {
    ...base,
    status: 'ranked',
    rank: row.rank,
    movement: row.movement,
    isNew: row.isNew,
    matchesInPeriod: row.matchesInPeriod,
  };
}

/**
 * The team's standing on every active tag title. It filters each title's
 * existing contenders payload on the client, so there is one request per tag
 * title. Pass no id (not in a team) to skip loading.
 */
export function useTagTeamContenderRanks(tagTeamId: string | null | undefined): TagTeamContenderRanks {
  const [standings, setStandings] = useState<TagTitleStanding[]>([]);
  const [loading, setLoading] = useState(Boolean(tagTeamId));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!tagTeamId) {
      setStandings([]);
      setLoading(false);
      setFailed(false);
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setFailed(false);
      try {
        const championships = await championshipsApi.getAll(controller.signal);
        const tagTitles = championships.filter((championship) => championship.isActive && championship.type === 'tag');
        const results = await Promise.allSettled(
          tagTitles.map((championship) => contendersApi.getForChampionship(championship.championshipId, controller.signal)),
        );
        if (controller.signal.aborted) return;

        const loaded = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
        setStandings(loaded.map((data) => toTagTitleStanding(data, tagTeamId)));
        setFailed(tagTitles.length > 0 && loaded.length === 0);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setStandings([]);
        setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [tagTeamId]);

  return { standings, loading, failed };
}
