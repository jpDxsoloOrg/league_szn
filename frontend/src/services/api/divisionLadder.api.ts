import type { DivisionLadderResponse, DivisionLadderUpdateInput } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

/** Admin only. Division ladder ordering, movement rules, and recent movements. */
export const divisionLadderApi = {
  get: async (signal?: AbortSignal): Promise<DivisionLadderResponse> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/division-ladder`, {}, signal);
  },

  /** `order` is the full list of divisionIds bottom → top; the server writes `rank` = index. */
  update: async (input: DivisionLadderUpdateInput): Promise<DivisionLadderResponse> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/division-ladder`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
};
