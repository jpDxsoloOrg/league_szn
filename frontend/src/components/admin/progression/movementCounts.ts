import type { ProgressionConsiderationEntry, ProgressionTrack } from '../../../types/progression';

export type MovementKind = 'promotion' | 'relegation';

export interface FlaggedCounts {
  promotion: number;
  relegation: number;
}

/** Flagged players per source division and kind, from the considerations lists. */
export function countFlagged(
  tracks: readonly ProgressionTrack[],
  promotion: readonly ProgressionConsiderationEntry[],
  relegation: readonly ProgressionConsiderationEntry[],
): Map<string, FlaggedCounts> {
  const sourceByTrack = new Map(tracks.map((track) => [track.trackId, track.fromDivisionId]));
  const counts = new Map<string, FlaggedCounts>();
  const add = (entries: readonly ProgressionConsiderationEntry[], kind: MovementKind) => {
    for (const entry of entries) {
      const divisionId = sourceByTrack.get(entry.trackId);
      if (!divisionId) continue;
      const current = counts.get(divisionId) ?? { promotion: 0, relegation: 0 };
      counts.set(divisionId, { ...current, [kind]: current[kind] + 1 });
    }
  };
  add(promotion, 'promotion');
  add(relegation, 'relegation');
  return counts;
}
