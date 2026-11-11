import { playersApi } from '../../services/api';
import { useStatsResource } from './useStatsResource';

const NO_IMAGES: ReadonlyMap<string, string | undefined> = new Map();

const loadImages = async (signal: AbortSignal): Promise<ReadonlyMap<string, string | undefined>> => {
  const players = await playersApi.getAll(signal);
  return new Map(players.map((player) => [player.playerId, player.imageUrl]));
};

/** The statistics API sends no photos, so they come from the roster. Initials show until, or unless, it loads. */
export function usePlayerImages(): ReadonlyMap<string, string | undefined> {
  return useStatsResource(loadImages).data ?? NO_IMAGES;
}
