import { useEffect, useState } from 'react';
import { progressionApi } from '../../services/api';
import type { PlayerProgressionSummary, ProgressionKind } from '../../types/progression';

export interface PlayerProgressionState {
  tracks: PlayerProgressionSummary[];
  loaded: boolean;
}

/**
 * The player's active progression tracks of one kind. A failed request
 * leaves the list empty, so callers simply render nothing.
 */
export function usePlayerProgression(
  playerId: string | null | undefined,
  kind: ProgressionKind = 'callup',
): PlayerProgressionState {
  const [state, setState] = useState<PlayerProgressionState>({ tracks: [], loaded: false });

  useEffect(() => {
    if (!playerId) {
      setState({ tracks: [], loaded: true });
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      try {
        const rows = await progressionApi.getForPlayer(playerId, controller.signal);
        if (controller.signal.aborted) return;
        setState({ tracks: rows.filter((row) => row.kind === kind), loaded: true });
      } catch {
        if (!controller.signal.aborted) setState({ tracks: [], loaded: true });
      }
    };
    void load();
    return () => controller.abort();
  }, [playerId, kind]);

  return state;
}
