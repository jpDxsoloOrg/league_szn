export interface FeatureFlags {
  challenges: boolean;
  promos: boolean;
  contenders: boolean;
  statistics: boolean;
  stables: boolean;
}

export const DEFAULT_FEATURES: FeatureFlags = {
  challenges: true,
  promos: true,
  contenders: true,
  statistics: true,
  stables: true,
};

export interface SiteConfigRepository {
  getFeatures(): Promise<FeatureFlags>;
  updateFeatures(patch: Partial<FeatureFlags>): Promise<FeatureFlags>;
}
