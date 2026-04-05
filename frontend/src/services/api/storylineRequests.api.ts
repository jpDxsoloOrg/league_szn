import type {
  StorylineRequest,
  StorylineRequestType,
  MyStorylineRequest,
  StorylineRequestWithDetails,
} from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const storylineRequestsApi = {
  create: async (data: {
    requestType: StorylineRequestType;
    targetPlayerIds: string[];
    description: string;
  }): Promise<StorylineRequest> => {
    return fetchWithAuth(`${API_BASE_URL}/storyline-requests`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getMine: async (): Promise<MyStorylineRequest[]> => {
    return fetchWithAuth(`${API_BASE_URL}/storyline-requests/me`);
  },

  getAll: async (status?: string): Promise<StorylineRequestWithDetails[]> => {
    const url = status
      ? `${API_BASE_URL}/admin/storyline-requests?status=${encodeURIComponent(status)}`
      : `${API_BASE_URL}/admin/storyline-requests`;
    return fetchWithAuth(url);
  },

  review: async (
    requestId: string,
    data: { status: 'acknowledged' | 'declined'; gmNote?: string }
  ): Promise<{ requestId: string; status: string; reviewedBy: string; updatedAt: string; gmNote?: string }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/storyline-requests/${requestId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};
