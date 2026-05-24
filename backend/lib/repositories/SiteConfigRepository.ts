export interface FeatureFlags {
  challenges: boolean;
  promos: boolean;
  contenders: boolean;
  statistics: boolean;
  stables: boolean;
  rivalries: boolean;
}

export const DEFAULT_FEATURES: FeatureFlags = {
  challenges: true,
  promos: true,
  contenders: true,
  statistics: true,
  stables: true,
  rivalries: true,
};

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
}
