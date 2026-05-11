import type {
  Stable,
  StableWithMembers,
  StableInvitationWithDetails,
  StableStanding,
  StableDetailResponse,
  CreateStableInput,
  InviteToStableInput,
} from '../../types/stable';
import type {
  FactionMessage,
  FactionDirectMessage,
} from '../../types/factionMessage';
import type {
  DirectMessageThreadSummary,
  FactionPromoFilter,
  FactionPromosResponse,
  FactionScheduleResponse,
  FactionStatsResponse,
} from '../../types/faction';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

// The data plane stays on /stables/* per the FAC-01 rename guardrail; only
// the namespace name on the client changes (factionsApi.*).
const factionsBase = (factionId: string) => `${API_BASE_URL}/stables/${factionId}`;

const buildQuery = (params: Record<string, string | number | undefined>): string => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const out = qs.toString();
  return out ? `?${out}` : '';
};

export const factionsApi = {
  getAll: async (filters?: { status?: string }, signal?: AbortSignal): Promise<Stable[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    const query = params.toString();
    return fetchWithAuth(`${API_BASE_URL}/stables${query ? `?${query}` : ''}`, {}, signal);
  },

  getById: async (stableId: string, signal?: AbortSignal): Promise<StableDetailResponse> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}`, {}, signal);
  },

  getStandings: async (signal?: AbortSignal): Promise<StableStanding[]> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/standings`, {}, signal);
  },

  create: async (input: CreateStableInput): Promise<Stable> => {
    return fetchWithAuth(`${API_BASE_URL}/stables`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  update: async (stableId: string, data: Partial<CreateStableInput>): Promise<Stable> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  approve: async (stableId: string): Promise<Stable> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/approve`, {
      method: 'POST',
    });
  },

  reject: async (stableId: string): Promise<Stable> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/reject`, {
      method: 'POST',
    });
  },

  invite: async (stableId: string, input: InviteToStableInput): Promise<StableInvitationWithDetails> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  respondToInvitation: async (
    stableId: string,
    invitationId: string,
    action: 'accept' | 'decline',
  ): Promise<{ invitation: StableInvitationWithDetails; stable: StableWithMembers }> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/invitations/${invitationId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  },

  disband: async (stableId: string): Promise<Stable> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/disband`, {
      method: 'POST',
    });
  },

  reactivate: async (
    stableId: string,
  ): Promise<{
    message: string;
    stableId: string;
    status: 'active';
    restoredMemberIds: string[];
    skippedMembers: { playerId: string; reason: 'not-found' | 'in-other-stable' }[];
  }> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/reactivate`, {
      method: 'POST',
    });
  },

  removeMember: async (stableId: string, playerId: string): Promise<Stable> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/remove-member`, {
      method: 'POST',
      body: JSON.stringify({ playerId }),
    });
  },

  leave: async (stableId: string, playerId: string): Promise<Stable> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/remove-member`, {
      method: 'POST',
      body: JSON.stringify({ playerId }),
    });
  },

  delete: async (stableId: string): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/stables/${stableId}`, {
      method: 'DELETE',
    });
  },

  getInvitations: async (stableId: string, signal?: AbortSignal): Promise<StableInvitationWithDetails[]> => {
    return fetchWithAuth(`${API_BASE_URL}/stables/${stableId}/invitations`, {}, signal);
  },

  // ─── Faction 1:1 direct messages (FAC-06) ────────────────────────────
  directMessages: {
    listMyThreads: async (
      factionId: string,
      signal?: AbortSignal,
    ): Promise<DirectMessageThreadSummary[]> => {
      const response: { items: DirectMessageThreadSummary[] } = await fetchWithAuth(
        `${factionsBase(factionId)}/direct-messages`,
        {},
        signal,
      );
      return response.items;
    },

    listThread: async (
      factionId: string,
      partnerPlayerId: string,
      opts: { cursor?: string; limit?: number } = {},
      signal?: AbortSignal,
    ): Promise<{ items: FactionDirectMessage[]; nextCursor?: string }> => {
      const qs = buildQuery({ cursor: opts.cursor, limit: opts.limit });
      return fetchWithAuth(
        `${factionsBase(factionId)}/direct-messages/${partnerPlayerId}${qs}`,
        {},
        signal,
      );
    },

    post: async (
      factionId: string,
      recipientPlayerId: string,
      body: string,
      signal?: AbortSignal,
    ): Promise<FactionDirectMessage> => {
      return fetchWithAuth(
        `${factionsBase(factionId)}/direct-messages`,
        {
          method: 'POST',
          body: JSON.stringify({ recipientPlayerId, body }),
        },
        signal,
      );
    },
  },

  // ─── Aggregated stats (FAC-07) ───────────────────────────────────────
  getStats: async (
    factionId: string,
    opts: { seasonId?: string } = {},
    signal?: AbortSignal,
  ): Promise<FactionStatsResponse> => {
    const qs = buildQuery({ seasonId: opts.seasonId });
    return fetchWithAuth(`${factionsBase(factionId)}/stats${qs}`, {}, signal);
  },

  // ─── Schedule tab (FAC-08) ───────────────────────────────────────────
  getSchedule: async (
    factionId: string,
    opts: { from?: string; to?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<FactionScheduleResponse> => {
    const qs = buildQuery({ from: opts.from, to: opts.to, limit: opts.limit });
    return fetchWithAuth(`${factionsBase(factionId)}/schedule${qs}`, {}, signal);
  },

  // ─── Promos tab (FAC-08) ─────────────────────────────────────────────
  getPromos: async (
    factionId: string,
    opts: { filter?: FactionPromoFilter; cursor?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<FactionPromosResponse> => {
    const qs = buildQuery({ filter: opts.filter, cursor: opts.cursor, limit: opts.limit });
    return fetchWithAuth(`${factionsBase(factionId)}/promos${qs}`, {}, signal);
  },

  // ─── Faction channel messages (FAC-05) ───────────────────────────────
  messages: {
    list: async (
      factionId: string,
      opts: { cursor?: string; limit?: number } = {},
      signal?: AbortSignal,
    ): Promise<{ items: FactionMessage[]; nextCursor?: string }> => {
      const qs = buildQuery({ cursor: opts.cursor, limit: opts.limit });
      return fetchWithAuth(`${factionsBase(factionId)}/messages${qs}`, {}, signal);
    },

    // Only user messages can be posted from the client — system events are
    // emitted server-side (e.g. member-joined, member-removed).
    post: async (
      factionId: string,
      body: string,
      signal?: AbortSignal,
    ): Promise<FactionMessage> => {
      return fetchWithAuth(
        `${factionsBase(factionId)}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ body, messageType: 'user' }),
        },
        signal,
      );
    },
  },
};
