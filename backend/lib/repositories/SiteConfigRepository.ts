import { TICKER_SEGMENT_KEYS, type TickerSegmentKey } from '../ticker/segments';

export interface FeatureFlags {
  challenges: boolean;
  promos: boolean;
  contenders: boolean;
  statistics: boolean;
  stables: boolean;
  rivalries: boolean;
  notifications: boolean;
  /** Division transfer requests. Off until the feature is reworked. */
  transfers: boolean;
  /** The league ticker under the header. Off removes it everywhere. */
  ticker: boolean;
}

export const DEFAULT_FEATURES: FeatureFlags = {
  challenges: true,
  promos: true,
  contenders: true,
  statistics: true,
  stables: true,
  rivalries: true,
  notifications: true,
  transfers: false,
  ticker: true,
};

export const TICKER_SCROLL_SPEEDS = ['slow', 'normal', 'fast'] as const;
export type TickerScrollSpeed = typeof TICKER_SCROLL_SPEEDS[number];

/** Admin settings for the league ticker (TKR-04). Public: the shell reads them. */
export interface TickerSettings {
  /** Segment keys `GET /ticker` may return. Anything not listed is left out. */
  enabledSegments: TickerSegmentKey[];
  scrollSpeed: TickerScrollSpeed;
  /**
   * Whether relegation watch and relegation zones are shown to everyone.
   * Off (the default) keeps them to GMs. Read by the promotion/relegation
   * features (DMV-04, DMV-07); the ticker only stores it.
   */
  publicRelegationWatch: boolean;
}

export const DEFAULT_TICKER_SETTINGS: TickerSettings = {
  enabledSegments: [...TICKER_SEGMENT_KEYS],
  scrollSpeed: 'normal',
  publicRelegationWatch: false,
};

/** Stored settings over the defaults, dropping segment keys that no longer exist. */
export function mergeTickerSettings(stored: Partial<TickerSettings> | undefined): TickerSettings {
  const merged = { ...DEFAULT_TICKER_SETTINGS, ...(stored ?? {}) };
  return {
    ...merged,
    enabledSegments: merged.enabledSegments.filter((key) => TICKER_SEGMENT_KEYS.includes(key)),
  };
}

/**
 * Admin-tunable knobs for the rivalry-heat formula. These mirror the
 * exported constants in `backend/lib/policies/rivalryHeat.ts`; setting
 * any of them overrides the file default at runtime so the formula
 * can be retuned without a deploy. Read by `computeRivalryHeat`'s
 * second argument.
 */
export interface RivalryHeatTunables {
  /** Neutral match rating — at this average a match contributes zero. */
  pivot: number;
  /** Max ratings count that can amplify a single match's weight. */
  maxWeight: number;
  /** Bounds for the final heatScore (both directions). */
  scoreCap: number;
  /** Multiplier applied to a Match-of-the-Night's contribution. */
  motnMultiplier: number;
  /** Base heat per contributing promo (call-out or rivalry type). */
  promoBase: number;
  /** Heat per fire reaction (and per trash reaction, inverted). */
  promoReactionStep: number;
  /** Max magnitude of the reaction bonus per promo. */
  promoBonusCap: number;
  /** Max reactions of each type that count toward the bonus. */
  promoMaxReactionCount: number;
}

export const DEFAULT_HEAT_TUNABLES: RivalryHeatTunables = {
  pivot: 2.5,
  maxWeight: 5,
  scoreCap: 100,
  motnMultiplier: 1.5,
  promoBase: 3,
  promoReactionStep: 1.4,
  promoBonusCap: 7,
  promoMaxReactionCount: 5,
};

export interface SiteConfigRepository {
  getFeatures(): Promise<FeatureFlags>;
  updateFeatures(patch: Partial<FeatureFlags>): Promise<FeatureFlags>;
  getHeatTunables(): Promise<RivalryHeatTunables>;
  updateHeatTunables(patch: Partial<RivalryHeatTunables>): Promise<RivalryHeatTunables>;
  getTickerSettings(): Promise<TickerSettings>;
  updateTickerSettings(patch: Partial<TickerSettings>): Promise<TickerSettings>;
}
