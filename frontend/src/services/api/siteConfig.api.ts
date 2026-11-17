import { API_BASE_URL, fetchWithAuth } from './apiClient';

export interface SiteFeatures {
  challenges: boolean;
  promos: boolean;
  contenders: boolean;
  statistics: boolean;
  stables: boolean;
  notifications: boolean;
  rivalries: boolean;
  transfers: boolean;
  /** The league ticker. Off removes it everywhere. */
  ticker: boolean;
}

/** Ticker segment keys, in the order the feed shows them. Mirrors `TICKER_PRIORITY` on the backend. */
export const TICKER_SEGMENT_KEYS = [
  'pinned',
  'tonight',
  'newChampions',
  'potentialCallups',
  'promotionWatch',
  'hotRivalries',
  'custom',
  'news',
  'upcomingShows',
  'champions',
  'latestResults',
] as const;
export type TickerSegmentKey = typeof TICKER_SEGMENT_KEYS[number];

export const TICKER_SCROLL_SPEEDS = ['slow', 'normal', 'fast'] as const;
export type TickerScrollSpeed = typeof TICKER_SCROLL_SPEEDS[number];

/** Admin ticker settings. Mirrors `TickerSettings` on the backend. */
export interface TickerSettings {
  enabledSegments: TickerSegmentKey[];
  scrollSpeed: TickerScrollSpeed;
  /** Show relegation watch and zones to everyone, not just GMs. */
  publicRelegationWatch: boolean;
}

export interface SiteConfigResponse {
  features: SiteFeatures;
  /** Older backends leave it out. */
  ticker?: TickerSettings;
}

/**
 * Admin-tunable knobs for the rivalry-heat formula. Mirrors the
 * `RivalryHeatTunables` interface on the backend.
 */
export interface RivalryHeatTunables {
  pivot: number;
  maxWeight: number;
  scoreCap: number;
  motnMultiplier: number;
  promoBase: number;
  promoReactionStep: number;
  promoBonusCap: number;
  promoMaxReactionCount: number;
}

export const siteConfigApi = {
  getFeatures: async (signal?: AbortSignal): Promise<SiteConfigResponse> => {
    return fetchWithAuth(`${API_BASE_URL}/site-config`, {}, signal);
  },

  updateFeatures: async (features: Partial<SiteFeatures>): Promise<{ features: SiteFeatures }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/site-config`, {
      method: 'PUT',
      body: JSON.stringify({ features }),
    });
  },

  updateTickerSettings: async (ticker: Partial<TickerSettings>): Promise<Required<SiteConfigResponse>> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/site-config`, {
      method: 'PUT',
      body: JSON.stringify({ ticker }),
    });
  },

  getHeatTunables: async (signal?: AbortSignal): Promise<{ tunables: RivalryHeatTunables }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/heat-config`, {}, signal);
  },

  updateHeatTunables: async (
    tunables: Partial<RivalryHeatTunables>,
  ): Promise<{ tunables: RivalryHeatTunables }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/heat-config`, {
      method: 'PUT',
      body: JSON.stringify({ tunables }),
    });
  },
};
