import { API_BASE_URL, fetchWithAuth } from './apiClient';

/** One headline in a ticker segment. `text` is ready to show. */
export interface TickerFeedItem {
  text: string;
  /** A site path ("/events/e1") or, for a GM message, an http(s) URL. */
  href?: string;
  /** When set, the frontend translates with `textParams` and falls back to `text`. */
  textKey?: string;
  textParams?: Record<string, string | number>;
}

/** A run of headlines under one label, such as "Tonight". */
export interface TickerFeedSegment {
  key: string;
  /** i18n key for the segment's label pill, e.g. `ticker.segments.tonight`. */
  labelKey: string;
  /** Lower comes first; the server already sorts by it. */
  priority: number;
  items: TickerFeedItem[];
}

export interface TickerFeed {
  segments: TickerFeedSegment[];
  generatedAt: string;
}

export const tickerApi = {
  /** GET /ticker (public). The server sends it with a one-minute cache. */
  get: async (signal?: AbortSignal): Promise<TickerFeed> => {
    return fetchWithAuth(`${API_BASE_URL}/ticker`, {}, signal);
  },
};
