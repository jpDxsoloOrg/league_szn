import type { Announcement } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  priority?: number;
  isActive?: boolean;
  expiresAt?: string;
}

export const announcementsApi = {
  getActive: async (signal?: AbortSignal): Promise<Announcement[]> => {
    return fetchWithAuth(`${API_BASE_URL}/announcements/active`, {}, signal);
  },

  getAll: async (signal?: AbortSignal): Promise<Announcement[]> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/announcements`, {}, signal);
  },

  create: async (data: CreateAnnouncementInput): Promise<Announcement> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/announcements`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<CreateAnnouncementInput>): Promise<Announcement> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/announcements/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/admin/announcements/${id}`, {
      method: 'DELETE',
    });
  },
};
