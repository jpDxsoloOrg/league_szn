import type { Video, VideoCategory } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export interface CreateVideoInput {
  title: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  category: VideoCategory;
  tags?: string[];
  isPublished?: boolean;
}

export const videosApi = {
  getPublished: async (category?: VideoCategory, signal?: AbortSignal): Promise<Video[]> => {
    const params = category ? `?category=${category}` : '';
    return fetchWithAuth(`${API_BASE_URL}/videos${params}`, {}, signal);
  },

  getById: async (videoId: string, signal?: AbortSignal): Promise<Video> => {
    return fetchWithAuth(`${API_BASE_URL}/videos/${videoId}`, {}, signal);
  },

  getAll: async (signal?: AbortSignal): Promise<Video[]> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/videos`, {}, signal);
  },

  create: async (data: CreateVideoInput): Promise<Video> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/videos`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<CreateVideoInput>): Promise<Video> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/videos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/admin/videos/${id}`, {
      method: 'DELETE',
    });
  },
};
