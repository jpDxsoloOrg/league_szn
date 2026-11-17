import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockPut } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPut: vi.fn() }));

vi.mock('../../../dynamodb', () => ({
  dynamoDb: { get: mockGet, put: mockPut },
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

describe('DynamoUserRepository siteConfig ticker settings', () => {
  const { siteConfig } = new DynamoUserRepository();

  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
  });

  it('defaults the ticker flag to on for a stored row without the key', async () => {
    mockGet.mockResolvedValue({ Item: { configKey: 'features', features: { challenges: false } } });

    expect((await siteConfig.getFeatures()).ticker).toBe(true);
  });

  it('fills missing settings from the defaults and drops unknown segment keys', async () => {
    mockGet.mockResolvedValue({ Item: { configKey: 'tickerSettings', settings: { enabledSegments: ['news', 'retired'] } } });

    expect(await siteConfig.getTickerSettings()).toEqual({
      enabledSegments: ['news'], scrollSpeed: 'normal', publicRelegationWatch: false,
    });
    expect(mockGet).toHaveBeenCalledWith({ TableName: 'SiteConfig', Key: { configKey: 'tickerSettings' } });
  });

  it('stores a patch merged over the current settings', async () => {
    mockGet.mockResolvedValue({ Item: { configKey: 'tickerSettings', settings: { scrollSpeed: 'slow' } } });
    mockPut.mockResolvedValue({});

    const updated = await siteConfig.updateTickerSettings({ publicRelegationWatch: true });

    expect(updated.scrollSpeed).toBe('slow');
    expect(updated.publicRelegationWatch).toBe(true);
    expect(mockPut).toHaveBeenCalledWith(expect.objectContaining({
      TableName: 'SiteConfig',
      Item: expect.objectContaining({ configKey: 'tickerSettings', settings: updated }),
    }));
  });
});
