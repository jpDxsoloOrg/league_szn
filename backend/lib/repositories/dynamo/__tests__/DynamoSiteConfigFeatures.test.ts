import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock('../../../dynamodb', () => ({
  dynamoDb: { get: mockGet },
  TableNames: { SITE_CONFIG: 'SiteConfig' },
}));

import { DynamoUserRepository } from '../DynamoUserRepository';

describe('DynamoUserRepository siteConfig.getFeatures', () => {
  const { siteConfig } = new DynamoUserRepository();

  beforeEach(() => {
    mockGet.mockReset();
  });

  it('defaults transfers to false for a stored row without the key', async () => {
    mockGet.mockResolvedValue({ Item: { configKey: 'features', features: { challenges: false } } });

    const features = await siteConfig.getFeatures();

    expect(features.transfers).toBe(false);
    expect(features.challenges).toBe(false);
    expect(features.promos).toBe(true);
  });

  it('keeps a stored transfers value', async () => {
    mockGet.mockResolvedValue({ Item: { configKey: 'features', features: { transfers: true } } });

    expect((await siteConfig.getFeatures()).transfers).toBe(true);
  });

  it('defaults transfers to false when no row exists', async () => {
    mockGet.mockResolvedValue({});

    expect((await siteConfig.getFeatures()).transfers).toBe(false);
  });
});
