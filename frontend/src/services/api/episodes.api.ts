import type { Episode, EpisodeDetail, YoutubeLookupResult } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';
import { normalizeVideo } from './videos.api';
import type { RawVideo } from './videos.api';

/** The backend stores `isPublished` as the string 'true' | 'false' (a GSI key). */
export type RawEpisode = Omit<Episode, 'isPublished'> & { isPublished: boolean | 'true' | 'false' };

interface RawEpisodeDetail {
  episode: RawEpisode;
  highlights: RawVideo[];
}

export function normalizeEpisode(raw: RawEpisode): Episode {
  return { ...raw, isPublished: raw.isPublished === true || raw.isPublished === 'true' };
}

export interface CreateEpisodeInput {
  /** Any YouTube video link form, or a bare 11-character id. */
  url: string;
  title: string;
  channelName?: string;
  description?: string;
  /** YYYY-MM-DD; the server defaults to today. */
  airDate?: string;
  eventId?: string | null;
  isPublished?: boolean;
}

export interface UpdateEpisodeInput {
  /** Changes the video. Title and channel change only if sent too. */
  url?: string;
  title?: string;
  channelName?: string;
  description?: string;
  airDate?: string;
  /** `null` unlinks the event. */
  eventId?: string | null;
  isPublished?: boolean;
}

export const episodesApi = {
  getPublished: async (signal?: AbortSignal): Promise<Episode[]> => {
    const rows: RawEpisode[] = await fetchWithAuth(`${API_BASE_URL}/episodes`, {}, signal);
    return rows.map(normalizeEpisode);
  },

  getByEvent: async (eventId: string, signal?: AbortSignal): Promise<Episode[]> => {
    const rows: RawEpisode[] = await fetchWithAuth(
      `${API_BASE_URL}/episodes?eventId=${encodeURIComponent(eventId)}`,
      {},
      signal,
    );
    return rows.map(normalizeEpisode);
  },

  getById: async (episodeId: string, signal?: AbortSignal): Promise<EpisodeDetail> => {
    const detail: RawEpisodeDetail = await fetchWithAuth(
      `${API_BASE_URL}/episodes/${encodeURIComponent(episodeId)}`,
      {},
      signal,
    );
    return {
      episode: normalizeEpisode(detail.episode),
      highlights: (detail.highlights ?? []).map(normalizeVideo),
    };
  },

  getAll: async (signal?: AbortSignal): Promise<Episode[]> => {
    const rows: RawEpisode[] = await fetchWithAuth(`${API_BASE_URL}/admin/episodes`, {}, signal);
    return rows.map(normalizeEpisode);
  },

  lookup: async (url: string): Promise<YoutubeLookupResult> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/episodes/youtube-lookup`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  },

  create: async (input: CreateEpisodeInput): Promise<Episode> => {
    return normalizeEpisode(await fetchWithAuth(`${API_BASE_URL}/admin/episodes`, {
      method: 'POST',
      body: JSON.stringify(input),
    }));
  },

  update: async (episodeId: string, patch: UpdateEpisodeInput): Promise<Episode> => {
    return normalizeEpisode(await fetchWithAuth(`${API_BASE_URL}/admin/episodes/${encodeURIComponent(episodeId)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }));
  },

  delete: async (episodeId: string): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/admin/episodes/${encodeURIComponent(episodeId)}`, {
      method: 'DELETE',
    });
  },
};
