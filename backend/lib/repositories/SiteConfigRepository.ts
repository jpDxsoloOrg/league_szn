export interface FeatureFlags {
  fantasy: boolean;
  challenges: boolean;
  promos: boolean;
  contenders: boolean;
  statistics: boolean;
  stables: boolean;
}

export const DEFAULT_FEATURES: FeatureFlags = {
  fantasy: true,
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
