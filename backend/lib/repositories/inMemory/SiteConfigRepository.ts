import type {
  FeatureFlags,
  SiteConfigRepository,
} from '../SiteConfigRepository';
import { DEFAULT_FEATURES } from '../SiteConfigRepository';

export class InMemorySiteConfigRepository implements SiteConfigRepository {
  features: FeatureFlags = { ...DEFAULT_FEATURES };

  async getFeatures(): Promise<FeatureFlags> {
    return { ...this.features };
  }

  async updateFeatures(patch: Partial<FeatureFlags>): Promise<FeatureFlags> {
    this.features = { ...this.features, ...patch };
    return { ...this.features };
  }
}
