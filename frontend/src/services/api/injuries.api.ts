import { API_BASE_URL, fetchWithAuth } from './apiClient';
// INJ-11 board types live in types/injuryReport; INJ-12 player types in types/injury.
import type {
  AdjustStaminaResult,
  Injury,
  InjuryBoardEntry,
  UpdateCurrentInjuryInput,
} from '../../types/injuryReport';
import type {
  InjuryConfigResponse,
  InjuryTunables,
  InjuryTunablesInput,
  PlayerCondition,
  PublicInjury,
} from '../../types/injury';

export const injuriesApi = {
  /** GET /admin/injury-config (Moderator and Admin): current tunables and kept versions. */
  getConfig: async (signal?: AbortSignal): Promise<InjuryConfigResponse> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/injury-config`, {}, signal);
  },

  /**
   * PUT /admin/injury-config (Admin only). Chance bands, severities and the
   * format multiplier map replace the stored ones. With `expectedVersion`, a
   * save over a newer version fails with a 409.
   */
  updateConfig: async (
    settings: InjuryTunablesInput,
    expectedVersion?: number,
  ): Promise<{ settings: InjuryTunables }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/injury-config`, {
      method: 'PUT',
      body: JSON.stringify({ settings, expectedVersion }),
    });
  },

  // INJ-11: the GM injury board (INJ-08 routes, Moderator and Admin).

  /** GET /injuries?active=true: every injury that has not ended, soonest return first. */
  listActive: async (signal?: AbortSignal): Promise<InjuryBoardEntry[]> => {
    return fetchWithAuth(`${API_BASE_URL}/injuries?active=true`, {}, signal);
  },

  /** POST /players/{id}/injuries/heal: ends the current injury now. */
  heal: async (playerId: string, note?: string): Promise<Injury> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${encodeURIComponent(playerId)}/injuries/heal`, {
      method: 'POST',
      body: JSON.stringify(note ? { note } : {}),
    });
  },

  /** PATCH /players/{id}/injuries/current: a new total length in weeks, or an exact return date. */
  updateCurrent: async (playerId: string, input: UpdateCurrentInjuryInput): Promise<Injury> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${encodeURIComponent(playerId)}/injuries/current`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  /** PATCH /players/{id}/stamina: sets stamina to a whole number. */
  adjustStamina: async (playerId: string, stamina: number, note?: string): Promise<AdjustStaminaResult> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${encodeURIComponent(playerId)}/stamina`, {
      method: 'PATCH',
      body: JSON.stringify(note ? { stamina, note } : { stamina }),
    });
  },

  // INJ-12: the player-facing side.

  /** GET /players/{playerId}/condition (the player themselves and staff): the stamina meter. */
  getPlayerCondition: async (playerId: string, signal?: AbortSignal): Promise<PlayerCondition> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${encodeURIComponent(playerId)}/condition`, {}, signal);
  },

  /** GET /players/{playerId}/injuries (public): injury history, newest first. Empty while the feature is off. */
  getPlayerHistory: async (playerId: string, signal?: AbortSignal): Promise<PublicInjury[]> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${encodeURIComponent(playerId)}/injuries`, {}, signal);
  },
};
