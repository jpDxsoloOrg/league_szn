import type { AppNotification } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export interface NotificationsListResponse {
  notifications: AppNotification[];
  nextCursor: string | null;
}

export interface UnreadCountResponse {
  count: number;
}

export const notificationsApi = {
  getAll: async (limit?: number, cursor?: string, signal?: AbortSignal): Promise<NotificationsListResponse> => {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return fetchWithAuth(`${API_BASE_URL}/notifications${query ? `?${query}` : ''}`, {}, signal);
  },

  getUnreadCount: async (signal?: AbortSignal): Promise<UnreadCountResponse> => {
    return fetchWithAuth(`${API_BASE_URL}/notifications/unread-count`, {}, signal);
  },

  markRead: async (notificationId: string): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/notifications/${notificationId}/read`, {
      method: 'PUT',
    });
  },

  markAllRead: async (): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/notifications/read-all`, {
      method: 'PUT',
    });
  },
};
