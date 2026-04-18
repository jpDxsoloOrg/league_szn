import { dynamoDb, TableNames } from '../../dynamodb';
import type {
  FeatureFlags,
  SiteConfigRepository,
} from '../SiteConfigRepository';
import { DEFAULT_FEATURES } from '../SiteConfigRepository';

export class DynamoSiteConfigRepository implements SiteConfigRepository {
  async getFeatures(): Promise<FeatureFlags> {
    const result = await dynamoDb.get({
      TableName: TableNames.SITE_CONFIG,
      Key: { configKey: 'features' },
    });

    if (result.Item?.features) {
      return result.Item.features as FeatureFlags;
    }

    return { ...DEFAULT_FEATURES };
  }

  async updateFeatures(patch: Partial<FeatureFlags>): Promise<FeatureFlags> {
    const current = await this.getFeatures();
    const updated = { ...current, ...patch };

    await dynamoDb.put({
      TableName: TableNames.SITE_CONFIG,
      Item: {
        configKey: 'features',
        features: updated,
        updatedAt: new Date().toISOString(),
      },
    });

    return updated;
  }
}
