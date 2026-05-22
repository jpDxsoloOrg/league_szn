import type {
  CreateRivalryInput,
  HydratedRivalry,
  Rivalry,
  RivalryActivityPage,
  RivalryHeat,
  RivalryMessage,
  RivalryMessageAudience,
  RivalryNote,
  RivalryNoteType,
  RivalryNoteVisibility,
  RivalryStatus,
} from '../../types/rivalry';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

// ─── Match-history rivalry (synthetic player-pair stats) ──────────────

export interface RivalryPlayer {
  playerId: string;
  name: string;
  wrestlerName: string;
  imageUrl?: string;
}

/**
 * Player-pair head-to-head stats served by GET /rivalries. This is the
 * legacy "match history rivalry" shape — distinct from the persistent
 * Rivalry storyline aggregate in types/rivalry.ts.
 */
export interface MatchHistoryRivalry {
  player1Id: string;
  player2Id: string;
  player1?: RivalryPlayer;
  player2?: RivalryPlayer;
  player1Wins: number;
  player2Wins: number;
  draws: number;
  matchCount: number;
  lastMatchDate: string;
  championshipMatches: number;
  recentMatchIds: string[];
  intensityBadge: 'heatingUp' | 'intense' | 'historic';
}

export interface MatchHistoryRivalriesResponse {
  rivalries: MatchHistoryRivalry[];
}

// ─── Persistent rivalry storyline aggregate (RIV-02..05) ──────────────

export interface RivalriesListResponse {
  rivalries: Rivalry[];
  nextCursor: string | null;
}

export interface RivalryMessagesPage {
  messages: RivalryMessage[];
  nextCursor: string | null;
}

export interface RivalryNotesResponse {
  notes: RivalryNote[];
}

export interface RivalryPatchInput {
  title?: string;
  description?: string;
  status?: RivalryStatus;
  heat?: RivalryHeat;
  moderatedBy?: string;
  moderationNote?: string;
  startedAt?: string;
  endedAt?: string;
  bookerName?: string;
}

export interface RivalryNoteUpsertInput {
  noteId?: string;
  noteType: RivalryNoteType;
  content: string;
  visibility?: RivalryNoteVisibility;
  linkedMatchId?: string;
  linkedEventId?: string;
  scheduledFor?: string;
}

type ListQuery = {
  status?: RivalryStatus;
  participantId?: string;
  seasonId?: string;
  eventId?: string;
  cursor?: string;
  limit?: number;
};

function buildQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/**
 * Service layer for the persistent rivalries feature. Mirrors the
 * backend HTTP surface: list/get/create on `/rivalry-requests`,
 * respond/update/delete on the same, plus messages and notes on the
 * `/rivalries/{id}/...` sub-paths and the merged activity feed.
 */
export const rivalriesApi = {
  // Legacy match-history aggregator (kept for the Statistics page).
  getRivalries: async (
    seasonId?: string,
    signal?: AbortSignal,
  ): Promise<MatchHistoryRivalriesResponse> => {
    const query = buildQuery({ seasonId });
    return fetchWithAuth(`${API_BASE_URL}/rivalries${query}`, {}, signal);
  },

  list: async (params: ListQuery = {}, signal?: AbortSignal): Promise<RivalriesListResponse> => {
    const query = buildQuery(params);
    return fetchWithAuth(`${API_BASE_URL}/rivalry-requests${query}`, {}, signal);
  },

  get: async (rivalryId: string, signal?: AbortSignal): Promise<HydratedRivalry> => {
    return fetchWithAuth(`${API_BASE_URL}/rivalry-requests/${rivalryId}`, {}, signal);
  },

  getActivity: async (
    params: { participantId?: string; eventId?: string; limit?: number; cursor?: string } = {},
    signal?: AbortSignal,
  ): Promise<RivalryActivityPage> => {
    const query = buildQuery(params);
    return fetchWithAuth(`${API_BASE_URL}/rivalries/activity${query}`, {}, signal);
  },

  create: async (input: CreateRivalryInput): Promise<Rivalry> => {
    return fetchWithAuth(`${API_BASE_URL}/rivalry-requests`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  respond: async (
    rivalryId: string,
    action: 'approve' | 'reject' | 'conclude',
    message?: string,
  ): Promise<{ rivalry: Rivalry; systemMessage: RivalryMessage }> => {
    return fetchWithAuth(`${API_BASE_URL}/rivalry-requests/${rivalryId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action, message }),
    });
  },

  update: async (rivalryId: string, patch: RivalryPatchInput): Promise<Rivalry> => {
    return fetchWithAuth(`${API_BASE_URL}/rivalry-requests/${rivalryId}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  delete: async (rivalryId: string): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/rivalry-requests/${rivalryId}`, {
      method: 'DELETE',
    });
  },

  messages: {
    list: async (
      rivalryId: string,
      params: { cursor?: string; limit?: number } = {},
      signal?: AbortSignal,
    ): Promise<RivalryMessagesPage> => {
      const query = buildQuery(params);
      return fetchWithAuth(
        `${API_BASE_URL}/rivalries/${rivalryId}/messages${query}`,
        {},
        signal,
      );
    },

    post: async (
      rivalryId: string,
      content: string,
      audience?: RivalryMessageAudience,
    ): Promise<{ message: RivalryMessage }> => {
      return fetchWithAuth(`${API_BASE_URL}/rivalries/${rivalryId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, audience }),
      });
    },
  },

  notes: {
    list: async (
      rivalryId: string,
      params: { noteType?: RivalryNoteType } = {},
      signal?: AbortSignal,
    ): Promise<RivalryNotesResponse> => {
      const query = buildQuery(params);
      return fetchWithAuth(
        `${API_BASE_URL}/rivalries/${rivalryId}/notes${query}`,
        {},
        signal,
      );
    },

    upsert: async (
      rivalryId: string,
      note: RivalryNoteUpsertInput,
    ): Promise<{ note: RivalryNote }> => {
      return fetchWithAuth(`${API_BASE_URL}/rivalries/${rivalryId}/notes`, {
        method: 'POST',
        body: JSON.stringify(note),
      });
    },

    delete: async (rivalryId: string, noteId: string): Promise<void> => {
      await fetchWithAuth(`${API_BASE_URL}/rivalries/${rivalryId}/notes/${noteId}`, {
        method: 'DELETE',
      });
    },
  },
};
