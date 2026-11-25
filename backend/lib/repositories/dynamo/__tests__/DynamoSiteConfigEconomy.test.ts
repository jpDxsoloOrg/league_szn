import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockPut } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPut: vi.fn() }));

vi.mock('../../../dynamodb', () => ({
  dynamoDb: { get: mockGet, put: mockPut },
  TableNames: { SITE_CONFIG: 'SiteConfig' },
}));

import { DynamoUserRepository } from '../DynamoUserRepository';
import { ConflictError } from '../../errors';
import {
  DEFAULT_ECONOMY_SETTINGS,
  ECONOMY_SETTINGS_VERSIONS_KEPT,
  toEconomySettingsInput,
  type EconomySettings,
} from '../../../policies/economyDefaults';

function storedVersion(version: number): EconomySettings {
  return { ...DEFAULT_ECONOMY_SETTINGS, noShowFine: version, version, updatedAt: `t${version}`, updatedBy: 'gm' };
}

describe('DynamoUserRepository economy settings', () => {
  const { siteConfig } = new DynamoUserRepository();
  const input = toEconomySettingsInput(DEFAULT_ECONOMY_SETTINGS);

  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
    mockPut.mockResolvedValue({});
  });

  it('falls back to the defaults when no row exists', async () => {
    mockGet.mockResolvedValue({});
    expect(await siteConfig.getEconomySettings()).toEqual(DEFAULT_ECONOMY_SETTINGS);
    expect(mockGet).toHaveBeenCalledWith({ TableName: 'SiteConfig', Key: { configKey: 'economySettings' } });
  });

  it('reads the newest stored version over the defaults', async () => {
    mockGet.mockResolvedValue({ Item: { versions: [storedVersion(4), storedVersion(3)] } });
    const settings = await siteConfig.getEconomySettings();
    expect(settings).toMatchObject({ version: 4, noShowFine: 4 });
  });

  it('writes the next version guarded on the version it read', async () => {
    mockGet.mockResolvedValue({ Item: { currentVersion: 2, versions: [storedVersion(2), storedVersion(1)] } });

    const saved = await siteConfig.saveEconomySettings({ ...input, noShowFine: 99 }, 'gm-jane');

    expect(saved).toMatchObject({ version: 3, noShowFine: 99, updatedBy: 'gm-jane' });
    const putArgs = mockPut.mock.calls[0][0];
    expect(putArgs.ConditionExpression).toBe('attribute_not_exists(configKey) OR currentVersion = :readVersion');
    expect(putArgs.ExpressionAttributeValues).toEqual({ ':readVersion': 2 });
    expect(putArgs.Item.currentVersion).toBe(3);
    expect(putArgs.Item.versions.map((version: EconomySettings) => version.version)).toEqual([3, 2, 1]);
  });

  it('keeps only the newest versions', async () => {
    const full = Array.from({ length: ECONOMY_SETTINGS_VERSIONS_KEPT }, (_, index) =>
      storedVersion(ECONOMY_SETTINGS_VERSIONS_KEPT - index));
    mockGet.mockResolvedValue({ Item: { versions: full } });

    await siteConfig.saveEconomySettings(input, 'gm');

    const versions: EconomySettings[] = mockPut.mock.calls[0][0].Item.versions;
    expect(versions).toHaveLength(ECONOMY_SETTINGS_VERSIONS_KEPT);
    expect(versions[0].version).toBe(ECONOMY_SETTINGS_VERSIONS_KEPT + 1);
    expect(versions.some((version) => version.version === 1)).toBe(false);
  });

  it('throws ConflictError on a stale expectedVersion without writing', async () => {
    mockGet.mockResolvedValue({ Item: { versions: [storedVersion(5)] } });
    await expect(siteConfig.saveEconomySettings(input, 'gm', 4)).rejects.toBeInstanceOf(ConflictError);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('turns a lost write race into ConflictError', async () => {
    mockGet.mockResolvedValue({});
    const raceError = Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
    mockPut.mockRejectedValue(raceError);
    await expect(siteConfig.saveEconomySettings(input, 'gm')).rejects.toBeInstanceOf(ConflictError);
  });
});
