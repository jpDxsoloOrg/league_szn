import type { ActivityFeedResponse } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const activityApi = {
  getAll: async (
    params?: { limit?: number; cursor?: string; type?: string },
    signal?: AbortSignal
  ): Promise<ActivityFeedResponse> => {
    const search = new URLSearchParams();
    if (params?.limit != null) search.set('limit', String(params.limit));
    if (params?.cursor) search.set('cursor', params.cursor);
    if (params?.type) search.set('type', params.type);
    const query = search.toString();
    return fetchWithAuth(
      `${API_BASE_URL}/activity${query ? `?${query}` : ''}`,
      {},
      signal
    ) as Promise<ActivityFeedResponse>;
  },
};
