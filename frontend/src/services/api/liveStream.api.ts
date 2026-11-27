import type { LiveStream, LiveStreamPatch } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

/** Mirrors the backend `LIVE_STREAM_MAX_HOURS`: a stream left on longer reads as offline. */
export const LIVE_STREAM_MAX_HOURS = 8;

export const LIVE_STREAM_TITLE_MAX_LENGTH = 120;

export const liveStreamApi = {
  get: async (signal?: AbortSignal): Promise<LiveStream> => {
    return fetchWithAuth(`${API_BASE_URL}/live-stream`, {}, signal);
  },

  update: async (patch: LiveStreamPatch): Promise<LiveStream> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/live-stream`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },
};
