import { useEffect, useState } from 'react';
import { progressionApi } from '../services/api';
import type { ProgressionConsiderationEntry, ProgressionKind } from '../types/progression';

/** How long one fetch serves every banner and badge before the next mount refetches. */
export const CONSIDERATIONS_CACHE_MS = 60_000;

interface CacheEntry {
  promise: Promise<ProgressionConsiderationEntry[]>;
  fetchedAt: number;
}

const cache = new Map<ProgressionKind, CacheEntry>();

/**
 * One shared request per kind. Every badge on a page awaits the same promise,
 * so a table of fifty rows still makes a single call. A failure is not cached.
 */
function loadConsiderations(kind: ProgressionKind): Promise<ProgressionConsiderationEntry[]> {
  const cached = cache.get(kind);
  if (cached && Date.now() - cached.fetchedAt < CONSIDERATIONS_CACHE_MS) return cached.promise;

  const promise = (async () => {
    try {
      return await progressionApi.getConsiderations(kind);
    } catch (err) {
      cache.delete(kind);
      throw err;
    }
  })();
  cache.set(kind, { promise, fetchedAt: Date.now() });
  return promise;
}

/** Test helper: forget every cached list. */
export function resetConsiderationsCache(): void {
  cache.clear();
}

export interface ConsiderationsState {
  /** Player ids under consideration for this kind. Empty until loaded or on error. */
  playerIds: ReadonlySet<string>;
  loaded: boolean;
}

const EMPTY: ReadonlySet<string> = new Set();

/** Players a GM has flagged for this kind (public list), shared across the page. */
export function useConsiderations(kind: ProgressionKind = 'callup'): ConsiderationsState {
  const [state, setState] = useState<ConsiderationsState>({ playerIds: EMPTY, loaded: false });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const rows = await loadConsiderations(kind);
        if (active) setState({ playerIds: new Set(rows.map((row) => row.playerId)), loaded: true });
      } catch {
        if (active) setState({ playerIds: EMPTY, loaded: true });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [kind]);

  return state;
}

/** True once loaded and the player is flagged for this kind. */
export function useIsConsidered(playerId: string | null | undefined, kind: ProgressionKind = 'callup'): boolean {
  const { playerIds } = useConsiderations(kind);
  return playerId ? playerIds.has(playerId) : false;
}
