import type {
  CreateProgressionTrackInput,
  ExecuteProgressionInput,
  PlayerProgression,
  PlayerProgressionSummary,
  ProgressionBoard,
  ProgressionConsiderationEntry,
  ProgressionKind,
  ProgressionTrack,
  ProgressionTrackFilter,
  RecomputeProgressionInput,
  SetConsiderationInput,
  UpdateProgressionTrackInput,
} from '../../types/progression';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

const enc = encodeURIComponent;

function toQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/**
 * Client for every /progression endpoint (CUP-04 read + tracks, CUP-05
 * consideration, CUP-06 execute, CUP-03 recompute). Auth is attached when
 * signed in; the player read returns more detail to the owner and staff.
 */
export const progressionApi = {
  /** Public. Goal detail for the owner and Moderator+; GM note for Moderator+. */
  getForPlayer: async (playerId: string, signal?: AbortSignal): Promise<PlayerProgressionSummary[]> => {
    return fetchWithAuth(`${API_BASE_URL}/progression/players/${enc(playerId)}`, {}, signal);
  },

  /** Public. */
  getTracks: async (filter: ProgressionTrackFilter = {}, signal?: AbortSignal): Promise<ProgressionTrack[]> => {
    const query = toQuery({
      kind: filter.kind,
      isActive: filter.isActive === undefined ? undefined : String(filter.isActive),
      fromDivisionId: filter.fromDivisionId,
    });
    return fetchWithAuth(`${API_BASE_URL}/progression/tracks${query}`, {}, signal);
  },

  /** Moderator+. Queues a recompute of the source division. */
  createTrack: async (input: CreateProgressionTrackInput): Promise<ProgressionTrack> => {
    return fetchWithAuth(`${API_BASE_URL}/progression/tracks`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** Moderator+. Partial update; queues a recompute of the source division. */
  updateTrack: async (trackId: string, input: UpdateProgressionTrackInput): Promise<ProgressionTrack> => {
    return fetchWithAuth(`${API_BASE_URL}/progression/tracks/${enc(trackId)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  /** Moderator+. Candidates in the track's source division, highest progress first. */
  getBoard: async (trackId: string, limit?: number, signal?: AbortSignal): Promise<ProgressionBoard> => {
    const query = toQuery({ limit: limit === undefined ? undefined : String(limit) });
    return fetchWithAuth(`${API_BASE_URL}/progression/tracks/${enc(trackId)}/players${query}`, {}, signal);
  },

  /** Moderator+ (CUP-05). Mark or unmark a player as under consideration on a track. */
  setConsideration: async (playerId: string, input: SetConsiderationInput): Promise<PlayerProgression> => {
    return fetchWithAuth(`${API_BASE_URL}/progression/players/${enc(playerId)}/consideration`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  /** CUP-05. Players currently under consideration, e.g. kind 'callup'. */
  getConsiderations: async (
    kind: ProgressionKind = 'callup',
    signal?: AbortSignal,
  ): Promise<ProgressionConsiderationEntry[]> => {
    return fetchWithAuth(`${API_BASE_URL}/progression/considerations${toQuery({ kind })}`, {}, signal);
  },

  /**
   * Moderator+ (CUP-06). Move the player to the destination division.
   * The response shape is defined by CUP-06; pass it as `TResult`.
   */
  execute: async <TResult = unknown>(playerId: string, input: ExecuteProgressionInput): Promise<TResult> => {
    return fetchWithAuth(`${API_BASE_URL}/progression/players/${enc(playerId)}/execute`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /**
   * Moderator+ (CUP-03). Recompute progression for some players, or `all`.
   * The response shape is defined by CUP-03; pass it as `TResult`.
   */
  recompute: async <TResult = unknown>(input: RecomputeProgressionInput): Promise<TResult> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/progression/recompute`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};
