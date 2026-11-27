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
  /** Links the highlight to a full episode. `null` removes the link (staff only). */
  episodeId?: string | null;
}

/** The backend stores `isPublished` as the string 'true' | 'false' (a GSI key). */
export type RawVideo = Omit<Video, 'isPublished'> & { isPublished: boolean | 'true' | 'false' };

/** Turns the stored string flag into a real boolean, so `'false'` never reads as truthy. */
export function normalizeVideo(raw: RawVideo): Video {
  return { ...raw, isPublished: raw.isPublished === true || raw.isPublished === 'true' };
}

function normalizeVideos(raw: RawVideo[]): Video[] {
  return raw.map(normalizeVideo);
}

export const videosApi = {
  getPublished: async (category?: VideoCategory, signal?: AbortSignal): Promise<Video[]> => {
    const params = category ? `?category=${category}` : '';
    return normalizeVideos(await fetchWithAuth(`${API_BASE_URL}/videos${params}`, {}, signal));
  },

  getById: async (videoId: string, signal?: AbortSignal): Promise<Video> => {
    return normalizeVideo(await fetchWithAuth(`${API_BASE_URL}/videos/${videoId}`, {}, signal));
  },

  getAll: async (signal?: AbortSignal): Promise<Video[]> => {
    return normalizeVideos(await fetchWithAuth(`${API_BASE_URL}/admin/videos`, {}, signal));
  },

  create: async (data: CreateVideoInput): Promise<Video> => {
    return normalizeVideo(await fetchWithAuth(`${API_BASE_URL}/admin/videos`, {
      method: 'POST',
      body: JSON.stringify(data),
    }));
  },

  update: async (id: string, data: Partial<CreateVideoInput>): Promise<Video> => {
    return normalizeVideo(await fetchWithAuth(`${API_BASE_URL}/admin/videos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }));
  },

  delete: async (id: string): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/admin/videos/${id}`, {
      method: 'DELETE',
    });
  },
};
